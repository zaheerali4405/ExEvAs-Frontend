import axiosClient from './axiosClient';

export const getEventStaff = (eventId) => axiosClient.get(`/event-staff/event/${eventId}`);
export const assignEventStaff = (eventId, employeeId, dutyType) =>
  axiosClient.post('/event-staff', { eventId, employeeId, dutyType });
export const updateEventStaff = (eventId, currentEmployeeId, employeeId, dutyType) =>
  axiosClient.patch(`/event-staff/event/${eventId}/employee/${currentEmployeeId}`, { employeeId, dutyType });
export const unassignEventStaff = (eventId, employeeId) =>
  axiosClient.delete(`/event-staff/event/${eventId}/employee/${employeeId}`);
export const getEventStaffDutyLimits = (eventId) =>
  axiosClient.get('/event-staff/duty-limits', { params: { eventId } });
