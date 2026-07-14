import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/auth/Login";
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
import VenueCategoriesList from './pages/venue-categories/VenueCategoriesList';
import VenuesList from './pages/venues/VenuesList';
import EquipmentList from './pages/equipment/EquipmentList';
import EventCategoriesList from './pages/event-categories/EventCategoriesList';
import EventsList from './pages/events/EventsList';
import EventResourcesPage from './pages/events/EventResourcesPage';
import SystemSettingsPage from './pages/system-settings/SystemSettingsPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
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
              <ProtectedRoute permission="permission.read-all">
                <PermissionsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute permission="user.read-all">
                <UsersList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/designations"
            element={
              <ProtectedRoute permission="designation.read-all">
                <DesignationsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/roles"
            element={
              <ProtectedRoute permission="role.read-all">
                <RolesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/role-permissions"
            element={
              <ProtectedRoute permission="role-permission.read-all">
                <RolePermissionsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/designation-roles"
            element={
              <ProtectedRoute permission="designation-role.read-all">
                <DesignationRolesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user-roles"
            element={
              <ProtectedRoute permission="user-role.read-all">
                <UserRolesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user-designations"
            element={
              <ProtectedRoute permission="user-designation.read-all">
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
          <Route
            path="/venue-categories"
            element={
              <ProtectedRoute permission="venue-category.read-all">
                <VenueCategoriesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/venues"
            element={
              <ProtectedRoute permission="venue.read-all">
                <VenuesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/equipment"
            element={
              <ProtectedRoute permission="equipment.read-all">
                <EquipmentList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/event-categories"
            element={
              <ProtectedRoute permission="event-category.read-all">
                <EventCategoriesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/events"
            element={
              <ProtectedRoute permission="event.read-all">
                <EventsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/events/:eventId/resources"
            element={
              <ProtectedRoute>
                <EventResourcesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/system-settings"
            element={
              <ProtectedRoute permission="system-settings.read">
                <SystemSettingsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
