import axiosClient from './axiosClient';

export const getUsers = () => axiosClient.get('/users');

export const createUser = (data) => axiosClient.post('/users', data);

export const updateUser = (id, data) => axiosClient.patch(`/users/${id}`, data);

export const setUserStatus = (id, isActive) =>
  axiosClient.patch(`/users/${id}/status`, { isActive });

export const setUserLockStatus = (id, isLocked) =>
  axiosClient.patch(`/users/${id}/lock-status`, { isLocked });
