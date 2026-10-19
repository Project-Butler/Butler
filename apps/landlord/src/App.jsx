import { useState } from 'react';
import { LoggedOutScreen } from '@butler/ui';
import { InstallBanner } from './install/InstallBanner';
import { LandlordLayout } from './layout/LandlordLayout';
import { LandlordDashboard } from './dashboard/LandlordDashboard';

export const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(true);

  if (!isAuthenticated) {
    return <LoggedOutScreen brand="Butler" onReturn={() => setIsAuthenticated(true)} />;
  }

  return (
    <>
      <InstallBanner />
      <LandlordLayout onLogout={() => setIsAuthenticated(false)}>
        <LandlordDashboard />
      </LandlordLayout>
    </>
  );
};
