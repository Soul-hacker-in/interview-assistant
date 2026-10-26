import { configureStore } from '@reduxjs/toolkit';
import interviewReducer from '../features/interview/interviewSlice';

export const store = configureStore({
  reducer: {
    interview: interviewReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
