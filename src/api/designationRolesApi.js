import axiosClient from './axiosClient';

export const getDesignationRoles = (designationId) =>
  axiosClient.get(`/designation-roles/designation/${designationId}`);

export const assignRoleToDesignation = (designationId, roleId) =>
  axiosClient.post('/designation-roles', { designationId, roleId });

export const unassignRoleFromDesignation = (designationId, roleId) =>
  axiosClient.delete(`/designation-roles/designation/${designationId}/role/${roleId}`);
