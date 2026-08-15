import axiosClient from './axiosClient';

export const getPrograms = () => axiosClient.get('/programs');
export const createProgram = (data) => axiosClient.post('/programs', data);
export const updateProgram = (id, data) => axiosClient.patch(`/programs/${id}`, data);
export const setProgramStatus = (id, isActive) => axiosClient.patch(`/programs/${id}/status`, { isActive });
