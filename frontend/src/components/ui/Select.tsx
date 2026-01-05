import React, { useState, useRef, useEffect } from 'react'

export interface SelectOption {
  label: string
  value: string | number
}

export interface SelectProps {
  options: SelectOption[]
  value?: string | number
  onChange?: (value: string | number) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  error?: string
}

const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '请选择',
  disabled = false,
  className = '',
  error
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const selectRef = useRef<HTMLDivElement>(null)
  
  const selectedOption = options.find(opt => opt.value === value)
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  const handleSelect = (optionValue: string | number) => {
    onChange?.(optionValue)
    setIsOpen(false)
  }
  
  return (
    <div className={`relative ${className}`} ref={selectRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full px-3 py-2 text-left border rounded
          flex items-center justify-between
          ${error ? 'border-red-500' : 'border-gray-300'}
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-gray-400'}
          focus:outline-none focus:ring-2
          ${error ? 'focus:ring-red-500' : 'focus:ring-blue-500'}
          transition-all duration-200
        `}
      >
        <span className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'transform rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={`
                w-full px-3 py-2 text-left hover:bg-gray-100
                ${value === option.value ? 'bg-blue-50 text-blue-600' : 'text-gray-900'}
                transition-colors duration-150
              `}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      
      {error && (
        <p className="mt-1.5 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}

export default Select
