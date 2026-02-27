import { forwardRef, type ImgHTMLAttributes } from "react";

type NextImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  priority?: boolean;
};

const Image = forwardRef<HTMLImageElement, NextImageProps>(
  ({ priority, loading, ...rest }, ref) => {
    return (
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
