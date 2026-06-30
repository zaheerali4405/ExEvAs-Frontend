import axiosClient from './axiosClient';

export const login = (email, password) =>
  axiosClient.post('/auth/login', { email, password });

export const send2faCode = (email, password, channel) =>
  axiosClient.post('/auth/send-2fa-code', { email, password, channel });

export const verify2fa = (userId, code) =>
  axiosClient.post('/auth/verify-2fa', { userId, code });

export const forgotPassword = (email, channel) =>
  axiosClient.post('/auth/forgot-password', { email, channel });

export const verifyResetCode = (email, code) =>
  axiosClient.post('/auth/verify-reset-code', { email, code });

export const resetPassword = (resetToken, newPassword) =>
  axiosClient.post('/auth/reset-password', { resetToken, newPassword });