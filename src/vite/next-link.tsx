import {
  type AnchorHTMLAttributes,
  forwardRef,
  type PropsWithChildren,
} from "react";
import { Link as RouterLink } from "react-router-dom";

type NextLinkProps = PropsWithChildren<
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
  }
>;

const Link = forwardRef<HTMLAnchorElement, NextLinkProps>(
  ({ href, children, ...rest }, ref) => {
    return (
      <RouterLink ref={ref} to={href} {...rest}>
        {children}
      </RouterLink>
    );
  },
);

Link.displayName = "Link";

export default Link;
