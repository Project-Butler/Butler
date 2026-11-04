import { CommunityPollScope, CommunityPostCategory, CommunityReportReason, CommunityReportStatus } from '@prisma/client';
import { AppError } from '../../platform/AppError.js';
import {
  assertAllowedBody,
  assertSingleValues,
  parsePagination,
  throwIfInvalid,
} from '../../platform/requestValidation.js';
import { sendData, sendList } from '../../platform/respond.js';
import { isUuid } from '../../platform/uuid.js';
import {
  createComment,
  createPost,
  createPostReport,
  deleteComment,
  deletePost,
  findMyBuildings,
  findPostDetail,
  findPosts,
  findVisibleComment,
  findVisiblePost,
  throwCommentNotFound,
  throwPostNotFound,
  updatePost,
} from './service.js';
import { castVote, closeExpiredPolls, createPoll, deletePoll, findPollDetail, findPolls, findVisiblePoll, throwPollNotFound } from './service/polls.js';
import { findReports, setCommentHidden, setPollHidden, setPostHidden, updateReportStatus } from './service/admin.js';

const LEGAL_DONG_CODE_PATTERN = /^\d{10}$/;
const MAX_TITLE_LENGTH = 100; // CommunityPost.title VarChar(100)
const MAX_POST_BODY_LENGTH = 5000; // 스키마는 text. 화면 한 편 분량으로 막아 둔다
const MAX_COMMENT_LENGTH = 1000; // CommunityComment.body VarChar(1000)
const MAX_REPORT_DETAIL_LENGTH = 500; // CommunityReport.detail VarChar(500)

const CREATE_POST_FIELDS = ['complexId', 'category', 'title', 'body'];
const UPDATE_POST_FIELDS = ['category', 'title', 'body'];
const COMMENT_FIELDS = ['complexId', 'body'];
const REPORT_FIELDS = ['reason', 'detail'];

// 페이지를 나누지 않는 짧은 목록(내 건물은 몇 개뿐)이라 한 페이지에 전부 담는다.
export const listMyBuildings = async (req, res, next) => {
  try {
    const items = await findMyBuildings(req.user);
    sendList(res, items, { page: 1, size: items.length, total: items.length, hasNext: false });
  } catch (error) {
    next(error);
  }
};

// ===== 게시판 =====

const parseLegalDongCode = (value) => {
  if (!LEGAL_DONG_CODE_PATTERN.test(value)) {
    throwIfInvalid([{ field: 'legalDongCode', reason: '10자리 법정동 코드여야 합니다.' }]);
  }
  return value;
};

// 앞뒤 공백을 떼고 1~max자.
const parseText = (value, field, max, details) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 1 || text.length > max) {
    details.push({ field, reason: `1~${max}자 문자열이어야 합니다.` });
    return undefined;
  }
  return text;
};

const parseEnum = (value, field, allowed, details) => {
  if (!Object.values(allowed).includes(value)) {
    details.push({ field, reason: `${Object.values(allowed).join(', ')} 중 하나여야 합니다.` });
    return undefined;
  }
  return value;
};

const parseComplexId = (value, details) => {
  if (!isUuid(value)) {
    details.push({ field: 'complexId', reason: 'UUID 형식이어야 합니다.' });
    return undefined;
  }
  return value;
};

const parseListQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  const { page, size } = parsePagination(query, details);
  const category =
    query.category === undefined ? undefined : parseEnum(query.category, 'category', CommunityPostCategory, details);
  if (query.mine !== undefined && query.mine !== 'true' && query.mine !== 'false') {
    details.push({ field: 'mine', reason: 'true 또는 false여야 합니다.' });
  }
  throwIfInvalid(details);
  return { page, size, category, mine: query.mine === 'true' };
};

const parseCreatePostBody = (body) => {
  assertAllowedBody(body, CREATE_POST_FIELDS);
  const details = [];
  const input = {
    complexId: parseComplexId(body.complexId, details),
    category: parseEnum(body.category, 'category', CommunityPostCategory, details),
    title: parseText(body.title, 'title', MAX_TITLE_LENGTH, details),
    body: parseText(body.body, 'body', MAX_POST_BODY_LENGTH, details),
  };
  throwIfInvalid(details);
  return input;
};

// 보낸 필드만 고친다. 하나도 없으면 400.
const parseUpdatePostBody = (body) => {
  assertAllowedBody(body, UPDATE_POST_FIELDS);
  const details = [];
  const fields = {};
  if (body.category !== undefined) fields.category = parseEnum(body.category, 'category', CommunityPostCategory, details);
  if (body.title !== undefined) fields.title = parseText(body.title, 'title', MAX_TITLE_LENGTH, details);
  if (body.body !== undefined) fields.body = parseText(body.body, 'body', MAX_POST_BODY_LENGTH, details);
  if (Object.keys(body).length === 0) details.push({ field: 'body', reason: '고칠 필드를 하나 이상 보내야 합니다.' });
  throwIfInvalid(details);
  return fields;
};

const parseCommentBody = (body) => {
  assertAllowedBody(body, COMMENT_FIELDS);
  const details = [];
  const input = {
    complexId: parseComplexId(body.complexId, details),
    body: parseText(body.body, 'body', MAX_COMMENT_LENGTH, details),
  };
  throwIfInvalid(details);
  return input;
};

// detail 은 선택. 비면 null.
const parseReportBody = (body) => {
  assertAllowedBody(body, REPORT_FIELDS);
  const details = [];
  const input = { reason: parseEnum(body.reason, 'reason', CommunityReportReason, details), detail: null };
  if (body.detail !== undefined && body.detail !== null) {
    if (typeof body.detail !== 'string' || body.detail.trim().length > MAX_REPORT_DETAIL_LENGTH) {
      details.push({ field: 'detail', reason: `${MAX_REPORT_DETAIL_LENGTH}자 이하 문자열이어야 합니다.` });
    } else {
      input.detail = body.detail.trim() || null;
    }
  }
  throwIfInvalid(details);
  return input;
};

// 법정동 코드 형식을 requireRegionMember 보다 먼저 본다(형식이 틀리면 403 대신 400).
export const checkLegalDongCode = (req, res, next) => {
  try {
    parseLegalDongCode(req.params.legalDongCode);
    next();
  } catch (error) {
    next(error);
  }
};

// 글을 찾아 req.communityPost 에 둔다. requireRegionMember 가 글의 법정동으로 자격을 보게 하려는 것.
// 형식이 틀린 id·없는 글·삭제된 글은 모두 같은 404.
export const loadPost = async (req, res, next) => {
  try {
    if (!isUuid(req.params.postId)) throwPostNotFound();
    req.communityPost = await findVisiblePost(req.params.postId);
    next();
  } catch (error) {
    next(error);
  }
};

export const loadComment = async (req, res, next) => {
  try {
    if (!isUuid(req.params.commentId)) throwCommentNotFound();
    req.communityComment = await findVisibleComment(req.params.commentId);
    next();
  } catch (error) {
    next(error);
  }
};

export const listPosts = async (req, res, next) => {
  try {
    const legalDongCode = parseLegalDongCode(req.params.legalDongCode);
    const { items, meta } = await findPosts(req.user, legalDongCode, parseListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

export const postPost = async (req, res, next) => {
  try {
    const post = await createPost(req.user, req.params.legalDongCode, parseCreatePostBody(req.body));
    sendData(res, post, { status: 201 });
  } catch (error) {
    next(error);
  }
};

export const getPost = async (req, res, next) => {
  try {
    if (!isUuid(req.params.postId)) throwPostNotFound();
    sendData(res, await findPostDetail(req.user, req.params.postId));
  } catch (error) {
    next(error);
  }
};

export const patchPost = async (req, res, next) => {
  try {
    sendData(res, await updatePost(req.user, req.communityPost, parseUpdatePostBody(req.body)));
  } catch (error) {
    next(error);
  }
};

export const removePost = async (req, res, next) => {
  try {
    await deletePost(req.user, req.communityPost);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const postComment = async (req, res, next) => {
  try {
    const comment = await createComment(req.user, req.communityPost, parseCommentBody(req.body));
    sendData(res, comment, { status: 201 });
  } catch (error) {
    next(error);
  }
};

export const removeComment = async (req, res, next) => {
  try {
    await deleteComment(req.user, req.communityComment);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const postReport = async (req, res, next) => {
  try {
    const report = await createPostReport(req.user, req.communityPost, parseReportBody(req.body));
    sendData(res, report, { status: 201 });
  } catch (error) {
    next(error);
  }
};

// ===== 투표 =====

const MAX_POLL_DESCRIPTION_LENGTH = 1000; // 스키마는 text. 상세 한 화면 분량
const MAX_OPTION_LABEL_LENGTH = 80; // CommunityPollOption.label VarChar(80)
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
const MAX_POLL_DAYS = 90;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const POLL_STATUSES = ['OPEN', 'CLOSED'];
const CREATE_POLL_FIELDS = ['scope', 'complexId', 'title', 'description', 'options', 'closesOn'];
const VOTE_FIELDS = ['optionId'];

const parsePollListQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  const { page, size } = parsePagination(query, details);
  const scope = query.scope === undefined ? undefined : parseEnum(query.scope, 'scope', CommunityPollScope, details);
  let status = 'OPEN';
  if (query.status !== undefined) {
    if (POLL_STATUSES.includes(query.status)) status = query.status;
    else details.push({ field: 'status', reason: `${POLL_STATUSES.join(', ')} 중 하나여야 합니다.` });
  }
  const complexId = query.complexId === undefined ? undefined : parseComplexId(query.complexId, details);
  throwIfInvalid(details);
  return { page, size, scope, status, complexId };
};

// 마감일(YYYY-MM-DD)을 그날 23:59 KST 로. 지금 이후 ~ 90일 안.
const parseClosesOn = (value, details) => {
  const closesAt = typeof value === 'string' && DATE_PATTERN.test(value) ? new Date(`${value}T23:59:00+09:00`) : null;
  if (!closesAt || Number.isNaN(closesAt.getTime())) {
    details.push({ field: 'closesOn', reason: 'YYYY-MM-DD 형식이어야 합니다.' });
    return undefined;
  }
  const now = Date.now();
  if (closesAt.getTime() <= now || closesAt.getTime() > now + MAX_POLL_DAYS * 24 * 60 * 60 * 1000) {
    details.push({ field: 'closesOn', reason: `오늘부터 ${MAX_POLL_DAYS}일 안이어야 합니다.` });
    return undefined;
  }
  return closesAt;
};

// 선택지 2~10개, 각 1~80자, 같은 문구 두 번은 안 된다.
const parseOptions = (value, details) => {
  if (!Array.isArray(value) || value.length < MIN_OPTIONS || value.length > MAX_OPTIONS) {
    details.push({ field: 'options', reason: `선택지는 ${MIN_OPTIONS}~${MAX_OPTIONS}개여야 합니다.` });
    return undefined;
  }
  const labels = value.map((label) => (typeof label === 'string' ? label.trim() : ''));
  if (labels.some((label) => label.length < 1 || label.length > MAX_OPTION_LABEL_LENGTH)) {
    details.push({ field: 'options', reason: `선택지는 1~${MAX_OPTION_LABEL_LENGTH}자여야 합니다.` });
    return undefined;
  }
  if (new Set(labels).size !== labels.length) {
    details.push({ field: 'options', reason: '같은 선택지를 두 번 쓸 수 없습니다.' });
    return undefined;
  }
  return labels;
};

const parseCreatePollBody = (body) => {
  assertAllowedBody(body, CREATE_POLL_FIELDS);
  const details = [];
  const input = {
    scope: parseEnum(body.scope, 'scope', CommunityPollScope, details),
    complexId: parseComplexId(body.complexId, details),
    title: parseText(body.title, 'title', MAX_TITLE_LENGTH, details),
    description: null,
    options: parseOptions(body.options, details),
    closesAt: parseClosesOn(body.closesOn, details),
  };
  if (body.description !== undefined && body.description !== null && body.description !== '') {
    input.description = parseText(body.description, 'description', MAX_POLL_DESCRIPTION_LENGTH, details);
  }
  throwIfInvalid(details);
  return input;
};

const parseVoteBody = (body) => {
  assertAllowedBody(body, VOTE_FIELDS);
  if (!isUuid(body.optionId)) throwIfInvalid([{ field: 'optionId', reason: 'UUID 형식이어야 합니다.' }]);
  return { optionId: body.optionId };
};

// 투표를 찾아 req.communityPoll 에 둔다(requireRegionMember 가 투표의 법정동으로 자격을 보게).
export const loadPoll = async (req, res, next) => {
  try {
    if (!isUuid(req.params.pollId)) throwPollNotFound();
    req.communityPoll = await findVisiblePoll(req.params.pollId);
    next();
  } catch (error) {
    next(error);
  }
};

export const listPolls = async (req, res, next) => {
  try {
    const legalDongCode = parseLegalDongCode(req.params.legalDongCode);
    const { items, meta } = await findPolls(req.user, legalDongCode, parsePollListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

export const postPoll = async (req, res, next) => {
  try {
    const poll = await createPoll(req.user, req.params.legalDongCode, parseCreatePollBody(req.body));
    sendData(res, poll, { status: 201 });
  } catch (error) {
    next(error);
  }
};

export const getPoll = async (req, res, next) => {
  try {
    if (!isUuid(req.params.pollId)) throwPollNotFound();
    sendData(res, await findPollDetail(req.user, req.params.pollId));
  } catch (error) {
    next(error);
  }
};

export const postVote = async (req, res, next) => {
  try {
    sendData(res, await castVote(req.user, req.communityPoll, parseVoteBody(req.body)), { status: 201 });
  } catch (error) {
    next(error);
  }
};

export const removePoll = async (req, res, next) => {
  try {
    await deletePoll(req.user, req.communityPoll);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

// ===== 운영자 =====

const REPORT_STATUS_FIELDS = ['status'];
const HIDDEN_FIELDS = ['hidden'];

const parseReportListQuery = (query) => {
  assertSingleValues(query);
  const details = [];
  const { page, size } = parsePagination(query, details);
  const status = query.status === undefined ? undefined : parseEnum(query.status, 'status', CommunityReportStatus, details);
  const reason = query.reason === undefined ? undefined : parseEnum(query.reason, 'reason', CommunityReportReason, details);
  throwIfInvalid(details);
  return { page, size, status, reason };
};

const parseReportStatusBody = (body) => {
  assertAllowedBody(body, REPORT_STATUS_FIELDS);
  const details = [];
  const status = parseEnum(body.status, 'status', CommunityReportStatus, details);
  throwIfInvalid(details);
  return status;
};

const parseHiddenBody = (body) => {
  assertAllowedBody(body, HIDDEN_FIELDS);
  if (typeof body.hidden !== 'boolean') throwIfInvalid([{ field: 'hidden', reason: 'true 또는 false여야 합니다.' }]);
  return body.hidden;
};

// 형식이 틀린 id 는 없는 것과 같은 404
const requireUuidParam = (value, code, message) => {
  if (!isUuid(value)) throw new AppError(code, 404, message);
  return value;
};

export const listReports = async (req, res, next) => {
  try {
    const { items, meta } = await findReports(parseReportListQuery(req.query));
    sendList(res, items, meta);
  } catch (error) {
    next(error);
  }
};

export const patchReport = async (req, res, next) => {
  try {
    const reportId = requireUuidParam(req.params.reportId, 'COMMUNITY_REPORT_NOT_FOUND', '신고를 찾을 수 없습니다.');
    sendData(res, await updateReportStatus(req.user, reportId, parseReportStatusBody(req.body)));
  } catch (error) {
    next(error);
  }
};

export const patchPostHidden = async (req, res, next) => {
  try {
    const postId = requireUuidParam(req.params.postId, 'COMMUNITY_POST_NOT_FOUND', '글을 찾을 수 없습니다.');
    sendData(res, await setPostHidden(req.user, postId, parseHiddenBody(req.body)));
  } catch (error) {
    next(error);
  }
};

export const patchCommentHidden = async (req, res, next) => {
  try {
    const commentId = requireUuidParam(req.params.commentId, 'COMMUNITY_COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다.');
    sendData(res, await setCommentHidden(req.user, commentId, parseHiddenBody(req.body)));
  } catch (error) {
    next(error);
  }
};

export const patchPollHidden = async (req, res, next) => {
  try {
    const pollId = requireUuidParam(req.params.pollId, 'COMMUNITY_POLL_NOT_FOUND', '투표를 찾을 수 없습니다.');
    sendData(res, await setPollHidden(req.user, pollId, parseHiddenBody(req.body)));
  } catch (error) {
    next(error);
  }
};

// ===== 정기 작업 =====

// GET /api/cron/community-polls (cronRouter.js)
export const runPollClosing = async (req, res, next) => {
  try {
    sendData(res, await closeExpiredPolls());
  } catch (error) {
    next(error);
  }
};
