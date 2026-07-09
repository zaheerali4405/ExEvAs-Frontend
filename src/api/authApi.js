import axiosClient from './axiosClient';

export const login = (email, password) =>
  axiosClient.post('/auth/login', { email, password });

export const send2faCode = (email, password) =>
  axiosClient.post('/auth/send-2fa-code', { email, password });

export const verify2fa = (userId, code) =>
  axiosClient.post('/auth/verify-2fa', { userId, code });

export const forgotPassword = (email) =>
  axiosClient.post('/auth/forgot-password', { email });

export const verifyResetCode = (email, code) =>
  axiosClient.post('/auth/verify-reset-code', { email, code });

export const resetPassword = (resetToken, newPassword) =>
  axiosClient.post('/auth/reset-password', { resetToken, newPassword });

export const getMe = () =>
  axiosClient.get('/auth/me');

export const changePassword = (currentPassword, newPassword) =>
  axiosClient.patch('/auth/change-password', { currentPassword, newPassword });

export const toggleTwoFa = (twoFaEnabled) =>
  axiosClient.patch('/auth/2fa', { twoFaEnabled });