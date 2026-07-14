import axiosClient from './axiosClient';

export const getEvents = () => axiosClient.get('/events');
export const getEvent = (id) => axiosClient.get(`/events/${id}`);
export const createEvent = (data) => axiosClient.post('/events', data);
export const updateEvent = (id, data) => axiosClient.patch(`/events/${id}`, data);
export const updateEventTime = (id, data) => axiosClient.patch(`/events/${id}/time`, data);
export const updateEventStatus = (id, status) => axiosClient.patch(`/events/${id}/status`, { status });
