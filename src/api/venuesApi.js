import axiosClient from './axiosClient';

export const getVenues = () => axiosClient.get('/venues');
export const createVenue = (data) => axiosClient.post('/venues', data);
export const updateVenue = (id, data) => axiosClient.patch(`/venues/${id}`, data);
export const setVenueStatus = (id, isActive) => axiosClient.patch(`/venues/${id}/status`, { isActive });
