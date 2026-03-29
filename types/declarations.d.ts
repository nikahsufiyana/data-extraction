/**
 * Module declarations for packages whose type definitions are not resolving
 * due to the project being stored on an external filesystem (exFAT/NTFS),
 * which causes pnpm to install packages without their .d.ts files being
 * correctly resolved by the VS Code language server.
 *
 * NOTE: react/jsx-runtime and react/jsx-dev-runtime are intentionally NOT
 * overridden here — doing so would shadow @types/react's JSX.IntrinsicElements
 * and produce TS7026 errors throughout. The real @types/react types handle these.
 */

// ── Next.js ───────────────────────────────────────────────────────────────────
declare module "next" {
  export interface Metadata {
    title?: string | { default: string; template?: string };
    description?: string;
    [key: string]: unknown;
  }
}

declare module "next/server" {
  export class NextRequest extends Request {
    nextUrl: URL;
    cookies: {
      get(name: string): { value: string } | undefined;
      getAll(): { name: string; value: string }[];
    };
  }
  export class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit): NextResponse;
    static redirect(url: string | URL, status?: number): NextResponse;
    static next(init?: ResponseInit): NextResponse;
    cookies: {
      set(name: string, value: string, options?: object): void;
      delete(name: string): void;
    };
  }
}

declare module "next/font/google" {
  interface FontOptions {
    subsets?: string[];
    weight?: string | string[];
    style?: string | string[];
    variable?: string;
    display?: "auto" | "block" | "swap" | "fallback" | "optional";
    preload?: boolean;
  }
  type FontResult = {
    className: string;
    variable: string;
    style: { fontFamily: string; fontWeight?: number; fontStyle?: string };
  };
  export function Geist(options: FontOptions): FontResult;
  export function Geist_Mono(options: FontOptions): FontResult;
  export function Inter(options: FontOptions): FontResult;
  export function Roboto(options: FontOptions): FontResult;
  // Allow any Google font
  const _default: (options: FontOptions) => FontResult;
  export default _default;
}

declare module "next/navigation" {
  export function useRouter(): {
    push(href: string): void;
    replace(href: string): void;
    back(): void;
    forward(): void;
    refresh(): void;
    prefetch(href: string): void;
  };
  export function usePathname(): string;
  export function useSearchParams(): URLSearchParams;
}

declare module "next/link" {
  import * as React from "react";
  interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    href: string | { pathname: string; query?: Record<string, string> };
    replace?: boolean;
    prefetch?: boolean;
  }
  const Link: React.FC<LinkProps>;
  export default Link;
}

declare module "next/image" {
  import * as React from "react";
  interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    fill?: boolean;
    priority?: boolean;
    quality?: number;
    placeholder?: "blur" | "empty";
    blurDataURL?: string;
  }
  const Image: React.FC<ImageProps>;
  export default Image;
}

declare module "next/headers" {
  export function cookies(): {
    get(name: string): { value: string } | undefined;
    getAll(): { name: string; value: string }[];
    set(name: string, value: string, options?: object): void;
    delete(name: string): void;
    has(name: string): boolean;
  };
  export function headers(): Headers;
}

// ── lucide-react ──────────────────────────────────────────────────────────────
declare module "lucide-react" {
  import * as React from "react";
  export interface LucideProps extends React.SVGAttributes<SVGElement> {
    size?: number | string;
    strokeWidth?: number | string;
    absoluteStrokeWidth?: boolean;
    color?: string;
  }
  type LucideIcon = React.FC<LucideProps>;

  export const Trash2: LucideIcon;
  export const Download: LucideIcon;
  export const Upload: LucideIcon;
  export const Loader2: LucideIcon;
  export const Loader2Icon: LucideIcon;
  export const ChevronDownIcon: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ChevronRightIcon: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const ChevronUpIcon: LucideIcon;
  export const ChevronLeft: LucideIcon;
  export const ChevronLeftIcon: LucideIcon;
  export const MoreHorizontal: LucideIcon;
  export const MoreHorizontalIcon: LucideIcon;
  export const Check: LucideIcon;
  export const CheckIcon: LucideIcon;
  export const X: LucideIcon;
  export const XIcon: LucideIcon;
  export const Search: LucideIcon;
  export const SearchIcon: LucideIcon;
  export const Circle: LucideIcon;
  export const CircleIcon: LucideIcon;
  export const Minus: LucideIcon;
  export const MinusIcon: LucideIcon;
  export const GripVertical: LucideIcon;
  export const GripVerticalIcon: LucideIcon;
  export const PanelLeft: LucideIcon;
  export const PanelLeftIcon: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const Calendar: LucideIcon;
  export const CalendarIcon: LucideIcon;
  export const Clock: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const Info: LucideIcon;
  export const Settings: LucideIcon;
  export const User: LucideIcon;
  export const Home: LucideIcon;
  export const Menu: LucideIcon;
  export const Plus: LucideIcon;
  export const Edit: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const Lock: LucideIcon;
  export const Mail: LucideIcon;
  export const Phone: LucideIcon;
  export const FileText: LucideIcon;
  export const Image: LucideIcon;
  export const Star: LucideIcon;
  export const Heart: LucideIcon;
  export const Bell: LucideIcon;
  export const LogOut: LucideIcon;
  // Catch-all for any other icon
  const _exports: Record<string, LucideIcon>;
  export default _exports;
}
