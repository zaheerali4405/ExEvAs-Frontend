import axiosClient from './axiosClient';

export const getModerationMeetings = () => axiosClient.get('/moderation-meetings');
export const getModerationMeeting = (id) => axiosClient.get(`/moderation-meetings/${id}`);
export const createModerationMeeting = (data) => axiosClient.post('/moderation-meetings', data);
export const updateModerationMeeting = (id, data) => axiosClient.patch(`/moderation-meetings/${id}`, data);
export const updateModerationMeetingTime = (id, data) => axiosClient.patch(`/moderation-meetings/${id}/time`, data);
export const updateModerationMeetingStatus = (id, status) =>
  axiosClient.patch(`/moderation-meetings/${id}/status`, { status });
