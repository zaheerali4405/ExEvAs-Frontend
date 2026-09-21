import axiosClient from './axiosClient';

export const getExamCategoryRules = () => axiosClient.get('/exam-category-rules');
// Any flag may be omitted — whatever isn't sent keeps its stored value.
export const setExamCategoryRule = (examCategoryId, examScopeId, flags) =>
  axiosClient.put('/exam-category-rules', { examCategoryId, examScopeId, ...flags });
