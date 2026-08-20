import {
  useCallback,
  useId,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';

/* --------------------------------------------------------------------- icons */

const ICON_PATHS: Record<string, string> = {
  upload: 'M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3',
  image:
    'M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v13A1.5 1.5 0 0118.5 20h-13A1.5 1.5 0 014 18.5v-13zm2.2 11.8l4.1-4.8 2.6 2.9 2.3-2.6 3 4.5M9 9.4a1.1 1.1 0 11-2.2 0 1.1 1.1 0 012.2 0z',
  wand: 'M5 19l9.5-9.5M14 4l1 2.4 2.4 1-2.4 1L14 11l-1-2.6-2.4-1 2.4-1L14 4zm5.4 7.6l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7.7-1.6zM6.6 4.2l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5L4.5 6.3l1.5-.6.6-1.5z',
  download: 'M12 4v11m0 0l-4.2-4.2M12 15l4.2-4.2M5 19h14',
  check: 'M5 12.8L9.4 17 19 7.4',
  alert: 'M12 8.4v5m0 3h.01M10.3 3.9L2.5 17.4A1.9 1.9 0 004.1 20h15.8a1.9 1.9 0 001.6-2.6L13.7 3.9a1.9 1.9 0 00-3.4 0z',
  info: 'M12 10.8v6M12 7.6h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 5l7 7-7 7',
  sun: 'M12 4.2V2m0 20v-2.2M4.2 12H2m20 0h-2.2M6.3 6.3L4.8 4.8m14.4 14.4l-1.5-1.5M6.3 17.7l-1.5 1.5M19.2 4.8l-1.5 1.5M16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z',
  moon: 'M20 14.4A8.4 8.4 0 019.6 4 8.5 8.5 0 1020 14.4z',
  help: 'M9.4 9.2a2.7 2.7 0 015.2.9c0 1.8-2.6 2.7-2.6 2.7M12 17.2h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  refresh: 'M19.5 12a7.5 7.5 0 01-13 5.1M4.5 12a7.5 7.5 0 0113-5.1M4.5 5.6v3.9h3.9m11.1 8.9v-3.9h-3.9',
  copy: 'M9 9V5.6A1.6 1.6 0 0110.6 4h7.8A1.6 1.6 0 0120 5.6v7.8a1.6 1.6 0 01-1.6 1.6H15M4 10.6A1.6 1.6 0 015.6 9h7.8A1.6 1.6 0 0115 10.6v7.8A1.6 1.6 0 0113.4 20H5.6A1.6 1.6 0 014 18.4v-7.8z',
  type: 'M4 6.5V4.6h16v1.9M12 4.6V20M8.6 20h6.8',
  palette:
    'M12 21a9 9 0 110-18c4.97 0 9 3.58 9 8 0 2.2-1.8 4-4 4h-1.6a1.8 1.8 0 00-1.3 3.05A1.8 1.8 0 0112 21zM7.5 10.5h.01M11 7.5h.01M15.5 9h.01',
  layers: 'M12 3.5L3 8l9 4.5L21 8l-9-4.5zM3 13l9 4.5L21 13M3 17.4l9 4.5 9-4.5',
  keyboard:
    'M3.5 7.5h17a1 1 0 011 1v7a1 1 0 01-1 1h-17a1 1 0 01-1-1v-7a1 1 0 011-1zM6.5 10.5h.01M9.5 10.5h.01M12.5 10.5h.01M15.5 10.5h.01M18 10.5h.01M7.5 13.5h9',
  target: 'M12 8.6a3.4 3.4 0 100 6.8 3.4 3.4 0 000-6.8zM12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M20 12a8 8 0 11-16 0 8 8 0 0116 0z',
  sliders: 'M5 6h14M5 12h14M5 18h14M9 6v0m0 0a1.6 1.6 0 100-.1M15 12a1.6 1.6 0 100-.1M8 18a1.6 1.6 0 100-.1',
  frame: 'M4 8V5.5A1.5 1.5 0 015.5 4H8m8 0h2.5A1.5 1.5 0 0120 5.5V8m0 8v2.5A1.5 1.5 0 0118.5 20H16M8 20H5.5A1.5 1.5 0 014 18.5V16',
  eye: 'M2.5 12s3.6-6.4 9.5-6.4S21.5 12 21.5 12s-3.6 6.4-9.5 6.4S2.5 12 2.5 12zm9.5 2.6a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2z',
};

export interface IconProps {
  name: keyof typeof ICON_PATHS | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/** Line icons drawn from a single path each, so they stay crisp at any size. */
export function Icon({ name, size = 18, className, strokeWidth = 1.6 }: IconProps) {
  const path = ICON_PATHS[name] ?? ICON_PATHS.info;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

/* --------------------------------------------------------------------- panel */

export interface PanelProps {
  title: string;
  step?: string;
  subtitle?: string;
  icon?: string;
  actions?: ReactNode;
  children?: ReactNode;
  id?: string;
  footer?: ReactNode;
  /** Adds a collapse control to the header. */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export function Panel({
  title,
  step,
  subtitle,
  icon,
  actions,
  children,
  id,
  footer,
  collapsible = false,
  defaultCollapsed = false,
}: PanelProps) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  const bodyId = useId();

  return (
    <section className="ga-panel" id={id} aria-label={title}>
      <header className="ga-panel__header">
        <div className="ga-panel__header-text">
          {step ? <span className="ga-label">{step}</span> : null}
          <h2 className="ga-panel-title">
            {icon ? (
              <span style={{ display: 'inline-flex', verticalAlign: '-3px', marginRight: 7 }}>
                <Icon name={icon} size={17} />
              </span>
            ) : null}
            {title}
          </h2>
          {subtitle && !collapsed ? <p className="ga-caption">{subtitle}</p> : null}
        </div>
        <div className="ga-row">
          {actions}
          {collapsible ? (
            <button
              type="button"
              className="ga-icon-btn"
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
              onClick={() => setCollapsed((value) => !value)}
            >
              <Icon
                name="chevron"
                size={14}
                className={collapsed ? 'ga-disclosure__caret' : 'ga-disclosure__caret ga-disclosure__caret--open'}
              />
            </button>
          ) : null}
        </div>
      </header>
      {collapsed ? null : (
        <div className="ga-panel__body" id={bodyId}>
          {children}
        </div>
      )}
      {footer && !collapsed ? <div className="ga-panel__footer">{footer}</div> : null}
    </section>
  );
}

/* ---------------------------------------------------------------- segmented */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  block?: boolean;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  block = true,
}: SegmentedProps<T>) {
  return (
    <div
      className={block ? 'ga-segmented ga-segmented--block' : 'ga-segmented'}
      role="group"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="ga-segmented__option"
          aria-pressed={option.value === value}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- switch */

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, title, description, disabled }: SwitchProps) {
  const id = useId();
  return (
    <label className={disabled ? 'ga-switch ga-switch--disabled' : 'ga-switch'} htmlFor={id}>
      <span className="ga-switch__copy">
        <span className="ga-switch__title">{title}</span>
        {description ? <span className="ga-caption">{description}</span> : null}
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.checked)}
      />
      <span className="ga-switch__track" aria-hidden="true" />
    </label>
  );
}

/* ------------------------------------------------------------------- slider */

export interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  help?: string;
  lowLabel?: string;
  highLabel?: string;
  disabled?: boolean;
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix = '',
  help,
  lowLabel,
  highLabel,
  disabled,
}: SliderProps) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="ga-slider">
      <div className="ga-slider__top">
        <label className="ga-slider__name" htmlFor={id}>
          {label}
        </label>
        <span className="ga-slider__value">
          {value}
          {suffix}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-describedby={help ? `${id}-help` : undefined}
        style={{ '--ga-fill': `${fill}%` } as CSSProperties}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.currentTarget.value))}
      />
      {lowLabel || highLabel ? (
        <div className="ga-slider__scale">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      ) : null}
      {help ? (
        <p className="ga-caption" id={`${id}-help`}>
          {help}
        </p>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- disclosure */

export interface DisclosureProps {
  summary: string;
  children?: ReactNode;
  defaultOpen?: boolean;
  badge?: ReactNode;
}

export function Disclosure({ summary, children, defaultOpen = false, badge }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="ga-disclosure">
      <button
        type="button"
        className="ga-disclosure__summary"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon
          name="chevron"
          size={13}
          className={open ? 'ga-disclosure__caret ga-disclosure__caret--open' : 'ga-disclosure__caret'}
        />
        <span className="ga-grow">{summary}</span>
        {badge}
      </button>
      {open ? (
        <div className="ga-disclosure__content" id={id}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- meter */

export function Meter({
  label,
  value,
  display,
}: {
  label: string;
  value: number;
  display: string;
}) {
  return (
    <div className="ga-meter">
      <div className="ga-meter__top">
        <span>{label}</span>
        <span className="ga-meter__value">{display}</span>
      </div>
      <div
        className="ga-meter__track"
        role="meter"
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="ga-meter__fill" style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- empty state */

export function EmptyState({
  icon = 'image',
  title,
  message,
  action,
}: {
  icon?: string;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="ga-empty">
      <Icon name={icon} size={38} className="ga-empty__icon" strokeWidth={1.3} />
      <p style={{ fontWeight: 600, color: 'var(--ga-text)' }}>{title}</p>
      <p className="ga-caption">{message}</p>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- copy button */

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard permission denied (or an insecure context): fall back to a
      // selection the user can copy manually.
      const area = document.createElement('textarea');
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }, [value]);

  return (
    <button type="button" className="ga-btn ga-btn--quiet" onClick={() => void copy()}>
      <Icon name={copied ? 'check' : 'copy'} size={14} />
      {copied ? 'Copied' : label}
    </button>
  );
}

/* --------------------------------------------------------------------- chips */

export function Chip({
  tone = 'default',
  children,
  dot,
}: {
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'error';
  children?: ReactNode;
  dot?: boolean;
}) {
  const className = tone === 'default' ? 'ga-chip' : `ga-chip ga-chip--${tone}`;
  return (
    <span className={className}>
      {dot ? <span className="ga-dot" /> : null}
      {children}
    </span>
  );
}
