import { InstallBanner } from './install/InstallBanner';
import { LandlordLayout } from './layout/LandlordLayout';
import { LandlordDashboard } from './dashboard/LandlordDashboard';

export const App = () => {
  return (
    <>
      <InstallBanner />
      <LandlordLayout>
        <LandlordDashboard />
      </LandlordLayout>
    </>
  );
};
