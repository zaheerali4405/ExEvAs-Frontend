import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/auth/Login";
import TwoFaChannel from "./pages/auth/TwoFaChannel";
import TwoFaCode from "./pages/auth/TwoFaCode";
import ForgotPassword from "./pages/auth/ForgotPassword";
import VerifyResetCode from "./pages/auth/VerifyResetCode";
import ResetPassword from "./pages/auth/ResetPassword";
import Dashboard from "./pages/Dashboard";

import PermissionsList from './pages/permissions/PermissionsList';
import UsersList from './pages/users/UsersList';
import DesignationsList from './pages/designations/DesignationsList';
import RolesList from './pages/roles/RolesList';
import RolePermissionsList from './pages/role-permissions/RolePermissionsList';
import DesignationRolesList from './pages/designation-roles/DesignationRolesList';
import UserRolesList from './pages/user-roles/UserRolesList';
import UserDesignationsList from './pages/user-designations/UserDesignationsList';
import ProfilePage from './pages/profile/ProfilePage';
import ChangePasswordPage from './pages/profile/ChangePasswordPage';
import SettingsPage from './pages/settings/SettingsPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/2FA-Channel" element={<TwoFaChannel />} />
          <Route path="/2FA-Code" element={<TwoFaCode />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-reset-code" element={<VerifyResetCode />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/permissions"
            element={
              <ProtectedRoute>
                <PermissionsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute>
                <UsersList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/designations"
            element={
              <ProtectedRoute>
                <DesignationsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/roles"
            element={
              <ProtectedRoute>
                <RolesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/role-permissions"
            element={
              <ProtectedRoute>
                <RolePermissionsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/designation-roles"
            element={
              <ProtectedRoute>
                <DesignationRolesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user-roles"
            element={
              <ProtectedRoute>
                <UserRolesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user-designations"
            element={
              <ProtectedRoute>
                <UserDesignationsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePasswordPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
