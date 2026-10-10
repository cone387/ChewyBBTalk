import React, { forwardRef, useId } from 'react'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', id, 'aria-describedby': describedBy, ...props }, ref) => {
    const generatedId = useId()
    const fieldId = id || generatedId
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={fieldId} className="app-field-label">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={!!error}
          aria-describedby={[describedBy, error ? `${fieldId}-error` : undefined].filter(Boolean).join(' ') || undefined}
          className={`app-input min-h-[100px] resize-y ${className}`}
          {...props}
        />
        {error && (
          <p id={`${fieldId}-error`} role="alert" className="mt-1.5 text-sm text-red-700">{error}</p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'

export default Textarea
