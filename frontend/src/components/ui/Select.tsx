import React, { useId } from 'react'

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

const Select: React.FC<SelectProps> = ({ options, value, onChange, placeholder = '请选择', disabled = false, className = '', error }) => {
  const id = useId()
  const selectedIndex = options.findIndex(option => option.value === value)
  return (
    <div className={className}>
      <select
        aria-label={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        disabled={disabled}
        value={selectedIndex < 0 ? '' : String(selectedIndex)}
        onChange={event => {
          const option = options[Number(event.target.value)]
          if (option && event.target.value !== '') onChange?.(option.value)
        }}
        className={`w-full px-3 py-2 text-left border rounded bg-white focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${error ? 'border-red-500' : 'border-gray-300'} ${selectedIndex < 0 ? 'text-gray-400' : 'text-gray-900'}`}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((option, index) => <option key={index} value={String(index)}>{option.label}</option>)}
      </select>
      {error && <p id={`${id}-error`} className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  )
}
export default Select
