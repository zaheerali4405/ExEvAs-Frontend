import axiosClient from './axiosClient';

export const getEquipment = () => axiosClient.get('/equipment');
export const createEquipment = (data) => axiosClient.post('/equipment', data);
export const updateEquipment = (id, data) => axiosClient.patch(`/equipment/${id}`, data);
export const setEquipmentStatus = (id, isActive) => axiosClient.patch(`/equipment/${id}/status`, { isActive });
