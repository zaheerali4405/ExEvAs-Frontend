import axiosClient from './axiosClient';

export const getDepartments = () => axiosClient.get('/main-app/departments');
export const getPrograms = () => axiosClient.get('/main-app/programs');
export const getClasses = (programId) =>
  axiosClient.get('/main-app/classes', { params: programId ? { programId } : {} });
