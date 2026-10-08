"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export interface CurrentPeriod {
    yearMonth: string;
    startDate: string;
    endDate: string;
    isClosed: boolean;
    today: string;
    /** Days until the period ends. Negative once it is overdue. */
    daysLeft: number;
    /** Today is past the end date and nobody has closed the period yet */
    overdue: boolean;
}

interface PeriodContextValue {
    period: CurrentPeriod | null;
    reload: () => void;
}

const PeriodContext = createContext<PeriodContextValue>({ period: null, reload: () => {} });

/** The mess's current billing period, loaded once for the whole dashboard. */
export function PeriodProvider({ children }: { children: ReactNode }) {
    const { token } = useAuth();
    const [period, setPeriod] = useState<CurrentPeriod | null>(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        api.mess
            .period(token)
            .then((p) => !cancelled && setPeriod(p))
            .catch(() => !cancelled && setPeriod(null));
        return () => {
            cancelled = true;
        };
    }, [token, tick]);

    const reload = useCallback(() => setTick((n) => n + 1), []);

    return <PeriodContext.Provider value={{ period, reload }}>{children}</PeriodContext.Provider>;
}

export function usePeriod() {
    return useContext(PeriodContext);
}

/** "Jun 17" in the viewer's language. Dates are plain calendar days, so read them as UTC. */
export function formatPeriodDay(isoDay: string, locale: string): string {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${isoDay}T00:00:00Z`));
}
