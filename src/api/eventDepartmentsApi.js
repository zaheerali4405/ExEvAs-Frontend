import axiosClient from './axiosClient';

export const getEventDepartments = (eventId) => axiosClient.get(`/event-departments/event/${eventId}`);
export const assignEventDepartment = (eventId, departmentId) =>
  axiosClient.post('/event-departments', { eventId, departmentId });
export const unassignEventDepartment = (eventId, departmentId) =>
  axiosClient.delete(`/event-departments/event/${eventId}/department/${departmentId}`);
