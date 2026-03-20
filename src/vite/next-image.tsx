import { forwardRef, type ImgHTMLAttributes } from "react";

type NextImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  priority?: boolean;
};

const Image = forwardRef<HTMLImageElement, NextImageProps>(
  ({ priority, loading, ...rest }, ref) => {
    return (
      // biome-ignore lint/a11y/useAltText: alt is forwarded through ...rest
      // biome-ignore lint/performance/noImgElement: this is a Next.js Image polyfill
      <img
        ref={ref}
        loading={priority ? "eager" : loading}
        decoding="async"
        {...rest}
      />
    );
  },
);

Image.displayName = "Image";

export default Image;
