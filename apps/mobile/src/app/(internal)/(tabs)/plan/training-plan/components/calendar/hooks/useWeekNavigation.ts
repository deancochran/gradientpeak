import { useCallback, useMemo, useState } from "react";

/**
 * Hook for managing week navigation in the training plan calendar
 * Handles current week state, navigation between weeks, and date calculations
 */
export function useWeekNavigation() {
  // Start with current week
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  });

  // Calculate week end date
  const currentWeekEnd = useMemo(() => {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(currentWeekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return weekEnd;
  }, [currentWeekStart]);

  // Calculate week number (simple calculation from start of year)
  const weekNumber = useMemo(() => {
    const startOfYear = new Date(currentWeekStart.getFullYear(), 0, 1);
    const daysSinceStartOfYear = Math.floor(
      (currentWeekStart.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
    );
    return Math.ceil((daysSinceStartOfYear + startOfYear.getDay() + 1) / 7);
  }, [currentWeekStart]);

  // Format week date range for display
  const weekDateRange = useMemo(() => {
    const startMonth = currentWeekStart.toLocaleDateString("en-US", {
      month: "short",
    });
    const startDay = currentWeekStart.getDate();
    const endMonth = currentWeekEnd.toLocaleDateString("en-US", {
      month: "short",
    });
    const endDay = currentWeekEnd.getDate();

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay}-${endDay}`;
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  }, [currentWeekStart, currentWeekEnd]);

  // Check if current week is the actual current week
  const isCurrentWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (
      today >= currentWeekStart &&
      today <= currentWeekEnd
    );
  }, [currentWeekStart, currentWeekEnd]);

  // Navigate to previous week
  const goToPreviousWeek = useCallback(() => {
    setCurrentWeekStart((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(prev.getDate() - 7);
      return newDate;
    });
  }, []);

  // Navigate to next week
  const goToNextWeek = useCallback(() => {
    setCurrentWeekStart((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(prev.getDate() + 7);
      return newDate;
    });
  }, []);

  // Jump to current week
  const goToCurrentWeek = useCallback(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    setCurrentWeekStart(weekStart);
  }, []);

  // Generate array of dates for the current week (Sunday - Saturday)
  const weekDates = useMemo(() => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + i);
      dates.push(date);
    }
    return dates;
  }, [currentWeekStart]);

  return {
    // Current week state
    currentWeekStart,
    currentWeekEnd,
    weekNumber,
    weekDateRange,
    isCurrentWeek,
    weekDates,

    // Navigation functions
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
  };
}
