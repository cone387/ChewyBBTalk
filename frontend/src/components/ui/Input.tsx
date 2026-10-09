import React, { forwardRef, useId } from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
  suffix?: React.ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, suffix, className = '', id, 'aria-describedby': describedBy, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id || generatedId
    const errorId = `${inputId}-error`
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="app-field-label">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={[describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined}
            className={`
              app-input
              ${icon ? 'pl-10' : ''}
              ${suffix ? 'pr-16' : ''}
              ${className}
            `.replace(/\s+/g, ' ')}
            {...props}
          />
          {suffix && (
            <div className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-500">
              {suffix}
            </div>
          )}
        </div>
        {error && (
          <p id={errorId} className="mt-1.5 text-sm text-red-700">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
