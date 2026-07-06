import axiosClient from './axiosClient';

export const getEventCategories = () => axiosClient.get('/event-categories');
export const createEventCategory = (data) => axiosClient.post('/event-categories', data);
export const updateEventCategory = (id, data) => axiosClient.patch(`/event-categories/${id}`, data);
export const setEventCategoryStatus = (id, isActive) => axiosClient.patch(`/event-categories/${id}/status`, { isActive });
