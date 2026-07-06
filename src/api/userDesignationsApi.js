import axiosClient from './axiosClient';

export const getUserDesignations = (userId) =>
  axiosClient.get(`/user-designations/user/${userId}`);

export const assignDesignationToUser = (userId, designationId) =>
  axiosClient.post('/user-designations', { userId, designationId });

export const setMainDesignation = (userId, designationId) =>
  axiosClient.patch(`/user-designations/user/${userId}/designation/${designationId}/set-main`);

export const unassignDesignationFromUser = (userId, designationId) =>
  axiosClient.delete(`/user-designations/user/${userId}/designation/${designationId}`);
