"use client";

import { create } from "zustand";
import type { AppView, AuthUser } from "@/types/manpower";

/**
 * Global UI/navigation state for the single-page application.
 * (Server state is handled with plain fetch + component state.)
 */

export type EmployeesPreset = {
  siteId?: string;
  status?: string;
  query?: string;
};

type AppState = {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;

  view: AppView;
  viewParams: Record<string, unknown>;
  navigate: (view: AppView, params?: Record<string, unknown>) => void;

  /** preset applied when Employees view mounts (e.g. dashboard site cards) */
  employeesPreset: EmployeesPreset | null;
  setEmployeesPreset: (preset: EmployeesPreset | null) => void;

  /** unread notification count, kept in sync by the shell */
  unreadCount: number;
  setUnreadCount: (n: number) => void;

  /** refresh signal for notifications bell */
  notifVersion: number;
  bumpNotifVersion: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),

  view: "dashboard",
  viewParams: {},
  navigate: (view, params = {}) => set({ view, viewParams: params }),

  employeesPreset: null,
  setEmployeesPreset: (employeesPreset) => set({ employeesPreset }),

  unreadCount: 0,
  setUnreadCount: (unreadCount) => set({ unreadCount }),

  notifVersion: 0,
  bumpNotifVersion: () => set((s) => ({ notifVersion: s.notifVersion + 1 })),
}));
