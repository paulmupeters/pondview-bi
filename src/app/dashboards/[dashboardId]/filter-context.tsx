"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { normalizeFilterPayload } from "@/lib/filters/normalize-filters";
import type { AvailableDimension, Filter } from "@/lib/types/filters";

export type FilterScope =
  | { kind: "dashboard" }
  | { kind: "chart"; chartId: string };

interface FilterContextValue {
  filters: Filter[]; // active scope filters
  dashboardFilters: Filter[];
  chartFiltersById: Record<string, Filter[]>;
  activeScope: FilterScope;
  setActiveScope: (scope: FilterScope) => void;
  availableDimensions: AvailableDimension[];
  addFilter: (filter: Filter) => void;
  removeFilter: (index: number) => void;
  updateFilter: (index: number, filter: Filter) => void;
  clearFilters: () => void;
  isLoading: boolean;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({
  dashboardId,
  children,
}: {
  dashboardId: string;
  children: ReactNode;
}) {
  const [dashboardFilters, setDashboardFilters] = useState<Filter[]>([]);
  const [chartFiltersById, setChartFiltersById] = useState<
    Record<string, Filter[]>
  >({});
  const [availableDimensions, setAvailableDimensions] = useState<
    AvailableDimension[]
  >([]);
  const [activeScope, setActiveScopeState] = useState<FilterScope>({
    kind: "dashboard",
  });
  const [isLoading, setIsLoading] = useState(true);

  const activeFilters = useMemo(() => {
    if (activeScope.kind === "dashboard") {
      return dashboardFilters;
    }
    return chartFiltersById[activeScope.chartId] ?? [];
  }, [activeScope, dashboardFilters, chartFiltersById]);

  const updateScopeFilters = useCallback(
    (scope: FilterScope, updater: (current: Filter[]) => Filter[]) => {
      if (scope.kind === "dashboard") {
        setDashboardFilters((prev) => updater(prev));
        return;
      }
      setChartFiltersById((prev) => {
        const current = prev[scope.chartId] ?? [];
        const next = updater(current);
        const copy = { ...prev };
        if (next.length > 0) {
          copy[scope.chartId] = next;
        } else {
          delete copy[scope.chartId];
        }
        return copy;
      });
    },
    [],
  );

  const setActiveScope = useCallback((scope: FilterScope) => {
    setActiveScopeState(scope);
  }, []);

  // Reset scope when dashboard changes.
  useEffect(() => {
    if (!dashboardId) {
      return;
    }
    setActiveScopeState({ kind: "dashboard" });
  }, [dashboardId]);

  // Load available dimensions from API on mount.
  useEffect(() => {
    let cancelled = false;

    async function loadDimensions() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/dashboard/${dashboardId}/dimensions`);
        if (!res.ok) {
          throw new Error(`Failed to load dimensions: ${res.statusText}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setAvailableDimensions(
            Array.isArray(data.dimensions) ? data.dimensions : [],
          );
        }
      } catch (error) {
        console.error("[Filters] Failed to load dimensions:", error);
        if (!cancelled) {
          setAvailableDimensions([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadDimensions();
    return () => {
      cancelled = true;
    };
  }, [dashboardId]);

  // Load dashboard-level filters from localStorage on mount.
  useEffect(() => {
    const key = `dashboard_${dashboardId}_filters`;
    const saved =
      typeof window !== "undefined" ? localStorage.getItem(key) : null;
    if (!saved) {
      setDashboardFilters([]);
      return;
    }
    try {
      const parsed = JSON.parse(saved);
      setDashboardFilters(normalizeFilterPayload(parsed));
    } catch (error) {
      console.error(
        "[Filters] Failed to parse saved dashboard filters:",
        error,
      );
      localStorage.removeItem(key);
      setDashboardFilters([]);
    }
  }, [dashboardId]);

  // Load chart-scoped filters from localStorage on mount.
  useEffect(() => {
    const key = `dashboard_${dashboardId}_chart_filters`;
    const saved =
      typeof window !== "undefined" ? localStorage.getItem(key) : null;
    if (!saved) {
      setChartFiltersById({});
      return;
    }
    try {
      const parsed = JSON.parse(saved) as Record<string, unknown>;
      const normalized: Record<string, Filter[]> = {};
      for (const [chartId, value] of Object.entries(parsed || {})) {
        const filters = normalizeFilterPayload(value);
        if (filters.length > 0) {
          normalized[chartId] = filters;
        }
      }
      setChartFiltersById(normalized);
    } catch (error) {
      console.error("[Filters] Failed to parse saved chart filters:", error);
      localStorage.removeItem(key);
      setChartFiltersById({});
    }
  }, [dashboardId]);

  // Persist dashboard filters.
  useEffect(() => {
    const key = `dashboard_${dashboardId}_filters`;
    try {
      if (dashboardFilters.length > 0) {
        localStorage.setItem(key, JSON.stringify(dashboardFilters));
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error("[Filters] Failed to save dashboard filters:", error);
    }
  }, [dashboardFilters, dashboardId]);

  // Persist chart filters.
  useEffect(() => {
    const key = `dashboard_${dashboardId}_chart_filters`;
    try {
      const hasAny = Object.keys(chartFiltersById).length > 0;
      if (hasAny) {
        localStorage.setItem(key, JSON.stringify(chartFiltersById));
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error("[Filters] Failed to save chart filters:", error);
    }
  }, [chartFiltersById, dashboardId]);

  const addFilter = (filter: Filter) => {
    updateScopeFilters(activeScope, (current) => [...current, filter]);
  };

  const removeFilter = (index: number) => {
    updateScopeFilters(activeScope, (current) =>
      current.filter((_, i) => i !== index),
    );
  };

  const updateFilter = (index: number, filter: Filter) => {
    updateScopeFilters(activeScope, (current) =>
      current.map((item, i) => (i === index ? filter : item)),
    );
  };

  const clearFilters = () => {
    updateScopeFilters(activeScope, () => []);
  };

  return (
    <FilterContext.Provider
      value={{
        filters: activeFilters,
        dashboardFilters,
        chartFiltersById,
        activeScope,
        setActiveScope,
        availableDimensions,
        addFilter,
        removeFilter,
        updateFilter,
        clearFilters,
        isLoading,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error("useFilters must be used within a FilterProvider");
  }
  return context;
}
