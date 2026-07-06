import axiosClient from './axiosClient';

export const getVenueCategories = () => axiosClient.get('/venue-categories');
export const createVenueCategory = (data) => axiosClient.post('/venue-categories', data);
export const updateVenueCategory = (id, data) => axiosClient.patch(`/venue-categories/${id}`, data);
export const setVenueCategoryStatus = (id, isActive) => axiosClient.patch(`/venue-categories/${id}/status`, { isActive });
