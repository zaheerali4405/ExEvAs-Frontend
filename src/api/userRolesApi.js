import axiosClient from './axiosClient';

export const getUserRoles = (userId) =>
  axiosClient.get(`/user-roles/user/${userId}`);

export const assignRoleToUser = (userId, roleId) =>
  axiosClient.post('/user-roles', { userId, roleId });

export const unassignRoleFromUser = (userId, roleId) =>
  axiosClient.delete(`/user-roles/user/${userId}/role/${roleId}`);
