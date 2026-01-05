import React, { forwardRef } from 'react'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = '', ...props }, ref) => {
    return (
      <label className="inline-flex items-center cursor-pointer">
        <input
          ref={ref}
          type="checkbox"
          className={`
            w-4 h-4 text-blue-600 border-gray-300 rounded
            focus:ring-2 focus:ring-blue-500
            disabled:opacity-50 disabled:cursor-not-allowed
            ${className}
          `}
          {...props}
        />
        {label && (
          <span className="ml-2 text-sm text-gray-700">{label}</span>
        )}
      </label>
    )
  }
)

Checkbox.displayName = 'Checkbox'

export default Checkbox
