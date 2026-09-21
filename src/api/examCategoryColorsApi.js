import axiosClient from './axiosClient';

export const getExamCategoryColors = () => axiosClient.get('/exam-category-colors');
// Any of backgroundColor/textColor/borderColor may be omitted (left as-is)
// or sent as null (cleared) — the row is upserted either way.
export const setExamCategoryColor = (examCategoryId, examScopeId, colors) =>
  axiosClient.put('/exam-category-colors', { examCategoryId, examScopeId, ...colors });
export const clearExamCategoryColor = (examCategoryId, examScopeId) =>
  axiosClient.delete(`/exam-category-colors/${examCategoryId}/${examScopeId}`);
