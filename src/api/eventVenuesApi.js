import axiosClient from './axiosClient';

export const getEventVenues = (eventId) => axiosClient.get(`/event-venues/event/${eventId}`);
export const assignEventVenue = (eventId, venueId, seats) =>
  axiosClient.post('/event-venues', { eventId, venueId, seats });
export const updateEventVenue = (eventId, currentVenueId, venueId, seats) =>
  axiosClient.patch(`/event-venues/event/${eventId}/venue/${currentVenueId}`, { venueId, seats });
export const unassignEventVenue = (eventId, venueId) =>
  axiosClient.delete(`/event-venues/event/${eventId}/venue/${venueId}`);
export const getEventVenueAvailability = (venueId, eventId) =>
  axiosClient.get('/event-venues/availability', { params: { venueId, eventId } });
