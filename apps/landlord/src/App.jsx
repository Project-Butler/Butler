import { useState } from 'react';
import { LoginScreen } from '@butler/ui';
import { postLogin, postLogout } from '@butler/api-client';
import { InstallBanner } from './install/InstallBanner';
import { LandlordLayout } from './layout/LandlordLayout';
import { LandlordDashboard } from './dashboard/LandlordDashboard';

export const App = () => {
  const [user, setUser] = useState(null);

  const handleLogin = async ({ email, password }) => {
    const { user: loggedInUser } = await postLogin({ email, password });
    setUser(loggedInUser);
  };

  const handleLogout = async () => {
    await postLogout();
    setUser(null);
  };

  if (!user) {
    return (
      <LoginScreen
        brand="Butler"
        subtitle="임대인 전용"
        devHint={import.meta.env.DEV ? 'fixture 계정: landlord@butler.test / password123' : undefined}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <>
      <InstallBanner />
      <LandlordLayout user={user} onLogout={handleLogout}>
        <LandlordDashboard />
      </LandlordLayout>
    </>
  );
};
