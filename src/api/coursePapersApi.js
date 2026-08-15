import axiosClient from './axiosClient';

export const getCoursePapers = () => axiosClient.get('/course-papers');
export const createCoursePaper = (data) => axiosClient.post('/course-papers', data);
export const updateCoursePaper = (id, data) => axiosClient.patch(`/course-papers/${id}`, data);
export const setCoursePaperStatus = (id, isActive) => axiosClient.patch(`/course-papers/${id}/status`, { isActive });
