import axiosClient from './axiosClient';

export const getDesignations = () => axiosClient.get('/designations');

export const createDesignation = (data) => axiosClient.post('/designations', data);

export const updateDesignation = (id, data) => axiosClient.patch(`/designations/${id}`, data);

export const setDesignationStatus = (id, isActive) =>
  axiosClient.patch(`/designations/${id}/status`, { isActive });
