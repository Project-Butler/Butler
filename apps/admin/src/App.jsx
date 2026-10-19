import { useState } from 'react';
import { LoggedOutScreen } from '@butler/ui';
import { AdminLayout } from './layout/AdminLayout';
import { AdminDashboard } from './dashboard/AdminDashboard';

export const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(true);

  if (!isAuthenticated) {
    return <LoggedOutScreen brand="Butler Admin" onReturn={() => setIsAuthenticated(true)} />;
  }

  return (
    <AdminLayout onLogout={() => setIsAuthenticated(false)}>
      <AdminDashboard />
    </AdminLayout>
  );
};
