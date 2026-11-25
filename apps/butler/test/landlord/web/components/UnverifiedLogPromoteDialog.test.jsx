// 인증 뒤 인증 전 기록 올리기 질문(#203 P-4b, H-44).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@butler/api-client", () => ({
  queryKey: new Proxy({}, { get: (_, name) => String(name) }),
  getUnverifiedLogPromotePreview: vi.fn(),
  postUnverifiedLogPromote: vi.fn(),
}));

import {
  getUnverifiedLogPromotePreview,
  postUnverifiedLogPromote,
} from "@butler/api-client";
import { UnverifiedLogPromoteDialog } from "../../../../src/landlord/web/components/UnverifiedLogPromoteDialog/UnverifiedLogPromoteDialog";

const PREVIEW = {
  count: 3,
  items: [
    {
      id: "a",
      title: "현관 도어락 교체",
      type: "REPAIR",
      occurredOn: "2026-11-02",
    },
    {
      id: "b",
      title: "보일러 점검",
      type: "INSPECTION",
      occurredOn: "2026-11-10",
    },
    {
      id: "c",
      title: "관리사무소 연락처",
      type: "NOTE",
      occurredOn: "2026-11-12",
    },
  ],
};

describe("인증 뒤 질문", () => {
  beforeEach(() => {
    vi.mocked(getUnverifiedLogPromotePreview).mockReset();
    vi.mocked(postUnverifiedLogPromote).mockReset();
  });

  it("대상이 있으면 목록과 두 버튼, [호실 이력으로 남기기]는 올리고 닫는다", async () => {
    vi.mocked(getUnverifiedLogPromotePreview).mockResolvedValue(PREVIEW);
    vi.mocked(postUnverifiedLogPromote).mockResolvedValue({ promotedCount: 3 });
    const onDone = vi.fn();
    render(<UnverifiedLogPromoteDialog ownershipId="o1" onDone={onDone} />);
    const dialog = await screen.findByRole("dialog", {
      name: "권리자 인증이 끝났어요",
    });
    expect(dialog).toHaveTextContent(
      "하우스 로그 3건(수리 1 · 점검 1 · 메모 1)",
    );
    expect(
      within(dialog)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "2026-11-02 · 현관 도어락 교체 · 수리",
      "2026-11-10 · 보일러 점검 · 점검",
      "2026-11-12 · 관리사무소 연락처 · 메모",
    ]);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "호실 이력으로 남기기" }),
    );
    expect(postUnverifiedLogPromote).toHaveBeenCalledWith("o1", undefined);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(onDone).toHaveBeenCalledWith({ promotedCount: 3 });
  });

  it("[나만 보기로 두기]는 skip: true로 보낸다", async () => {
    vi.mocked(getUnverifiedLogPromotePreview).mockResolvedValue(PREVIEW);
    vi.mocked(postUnverifiedLogPromote).mockResolvedValue({ promotedCount: 0 });
    render(<UnverifiedLogPromoteDialog ownershipId="o1" />);
    await userEvent.click(
      await screen.findByRole("button", { name: "나만 보기로 두기" }),
    );
    expect(postUnverifiedLogPromote).toHaveBeenCalledWith("o1", { skip: true });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("대상이 없거나(이미 처리) 인증 전이면 묻지 않는다", async () => {
    vi.mocked(getUnverifiedLogPromotePreview).mockResolvedValue({
      count: 0,
      items: [],
    });
    const { rerender } = render(
      <UnverifiedLogPromoteDialog ownershipId="o1" />,
    );
    await waitFor(() =>
      expect(getUnverifiedLogPromotePreview).toHaveBeenCalledWith("o1"),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    vi.mocked(getUnverifiedLogPromotePreview).mockClear();
    rerender(<UnverifiedLogPromoteDialog ownershipId={undefined} />);
    expect(getUnverifiedLogPromotePreview).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("이미 처리됐다는 409면 다시 묻지 않고 닫는다", async () => {
    vi.mocked(getUnverifiedLogPromotePreview).mockResolvedValue(PREVIEW);
    vi.mocked(postUnverifiedLogPromote).mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: { code: "ALREADY_PROMOTED", message: "이미 처리했습니다." },
        },
      },
    });
    render(<UnverifiedLogPromoteDialog ownershipId="o1" />);
    await userEvent.click(
      await screen.findByRole("button", { name: "호실 이력으로 남기기" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("×로 닫으면 이번에는 숨기고 올리지 않는다", async () => {
    vi.mocked(getUnverifiedLogPromotePreview).mockResolvedValue(PREVIEW);
    render(<UnverifiedLogPromoteDialog ownershipId="o1" />);
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(postUnverifiedLogPromote).not.toHaveBeenCalled();
  });
});
