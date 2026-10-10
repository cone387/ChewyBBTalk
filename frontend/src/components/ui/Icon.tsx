import type { SVGProps } from 'react'

const paths = {
  close: 'M6 6l12 12M6 18 18 6',
  chevronLeft: 'm15 18-6-6 6-6',
  chevronRight: 'm9 18 6-6-6-6',
  link: 'M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7',
  pin: 'm16 3 5 5-4 1-4 4-1 4-5-5 4-1 4-4 1-4ZM7 17l-4 4',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4Z',
  trash: 'M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6',
} as const

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'strokeWidth'> {
  name?: keyof typeof paths
  size?: 14 | 16 | 18 | 20 | 24 | 28 | 32 | 48
}

/** Decorative by default: the containing button/link owns the accessible name.
 * Named actions share paths; feature-specific shapes may supply children.
 * Logos, illustrations and loading spinners are separate visual primitives.
 */
export default function Icon({ name, size = 18, children, className = '', ...props }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false" className={`app-icon shrink-0 ${className}`} {...props}>
    {name ? <path d={paths[name]} /> : children}
  </svg>
}
