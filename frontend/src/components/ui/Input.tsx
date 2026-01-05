import React, { forwardRef } from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
  suffix?: React.ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, suffix, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
            className={`
              w-full px-3 py-2 border rounded
              text-gray-800 placeholder:text-gray-400
              ${icon ? 'pl-10' : ''}
              ${suffix ? 'pr-10' : ''}
              ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}
              focus:outline-none focus:ring-2 focus:border-transparent
              transition-all duration-200
              disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed
              ${className}
            `.replace(/\s+/g, ' ')}
            {...props}
          />
          {suffix && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
              {suffix}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-red-600">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
