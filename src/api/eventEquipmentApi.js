import axiosClient from './axiosClient';

export const getEventEquipment = (eventId) => axiosClient.get(`/event-equipment/event/${eventId}`);
export const assignEventEquipment = (eventId, equipmentId, quantity) =>
  axiosClient.post('/event-equipment', { eventId, equipmentId, quantity });
export const updateEventEquipment = (eventId, currentEquipmentId, equipmentId, quantity) =>
  axiosClient.patch(`/event-equipment/event/${eventId}/equipment/${currentEquipmentId}`, { equipmentId, quantity });
export const unassignEventEquipment = (eventId, equipmentId) =>
  axiosClient.delete(`/event-equipment/event/${eventId}/equipment/${equipmentId}`);
export const getEventEquipmentAvailability = (equipmentId, eventId) =>
  axiosClient.get('/event-equipment/availability', { params: { equipmentId, eventId } });
