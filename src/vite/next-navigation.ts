import { useMemo } from "react";
import {
  useLocation,
  useNavigate,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom";

export type ReadonlyURLSearchParams = URLSearchParams;

type RouterLike = {
  push: (href: string) => void;
  replace: (href: string) => void;
  prefetch: (_href: string) => Promise<void>;
  refresh: () => void;
};

export function useRouter(): RouterLike {
  const navigate = useNavigate();

  return useMemo(
    () => ({
      push: (href: string) => navigate(href),
      replace: (href: string) => navigate(href, { replace: true }),
      prefetch: async () => {},
      refresh: () => window.location.reload(),
    }),
    [navigate],
  );
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): ReadonlyURLSearchParams {
  const [searchParams] = useRouterSearchParams();
  return searchParams;
}
