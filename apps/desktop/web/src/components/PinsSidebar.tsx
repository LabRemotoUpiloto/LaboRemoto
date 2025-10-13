import React, { useState } from 'react'
import './PinsSidebar.css'

interface Pin {
  number: number
  name: string
  type: 'power' | 'ground' | 'gpio'
  function?: string
  color: string
  description: string
}

interface PinsSidebarProps {
  onPinSelect: (pin: Pin) => void
  selectedPin?: Pin | null
}

const pinsData: Pin[] = [
  // Orden exacto como en la imagen: impares a la izquierda, pares a la derecha
  // Columna izquierda (impares)
  { number: 1, name: 'Poder 3v3', type: 'power', color: '#FF8C00', description: 'Alimentación 3.3V' }, // Naranja
  { number: 3, name: 'GPIO 2', type: 'gpio', function: 'I2C1 SDA', color: '#87CEEB', description: 'GPIO 2 (I2C1 SDA)' }, // Azul claro
  { number: 5, name: 'GPIO 3', type: 'gpio', function: 'SCL I2C1', color: '#87CEEB', description: 'GPIO 3 (SCL I2C1)' }, // Azul claro
  { number: 7, name: 'GPIO 4', type: 'gpio', function: 'GPCLK0', color: '#DDA0DD', description: 'GPIO 4 (GPCLK0)' }, // Púrpura
  { number: 9, name: 'Suelo', type: 'ground', color: '#556B2F', description: 'Tierra' }, // Verde oliva
  { number: 11, name: 'GPIO 17', type: 'gpio', function: 'GPIO', color: '#556B2F', description: 'GPIO 17' }, // Verde oliva
  { number: 13, name: 'GPIO 27', type: 'gpio', function: 'GPIO', color: '#556B2F', description: 'GPIO 27' }, // Verde oliva
  { number: 15, name: 'GPIO 22', type: 'gpio', function: 'GPIO', color: '#556B2F', description: 'GPIO 22' }, // Verde oliva
  { number: 17, name: 'Poder 3v3', type: 'power', color: '#FF8C00', description: 'Alimentación 3.3V' }, // Naranja
  { number: 19, name: 'GPIO 10', type: 'gpio', function: 'SPI0 MOSI', color: '#FF69B4', description: 'GPIO 10 (SPI0 MOSI)' }, // Rosa
  { number: 21, name: 'GPIO 9', type: 'gpio', function: 'SPI0 MISO', color: '#FF69B4', description: 'GPIO 9 (SPI0 MISO)' }, // Rosa
  { number: 23, name: 'GPIO 11', type: 'gpio', function: 'SPI0 SCLK', color: '#FF69B4', description: 'GPIO 11 (SPI0 SCLK)' }, // Rosa
  { number: 25, name: 'Suelo', type: 'ground', color: '#556B2F', description: 'Tierra' }, // Verde oliva
  { number: 27, name: 'GPIO 0', type: 'gpio', function: 'EEPROM SDA', color: '#87CEEB', description: 'GPIO 0 (EEPROM SDA)' }, // Azul claro
  { number: 29, name: 'GPIO 5', type: 'gpio', function: 'GPIO', color: '#556B2F', description: 'GPIO 5' }, // Verde oliva
  { number: 31, name: 'GPIO 6', type: 'gpio', function: 'GPIO', color: '#556B2F', description: 'GPIO 6' }, // Verde oliva
  { number: 33, name: 'GPIO 13', type: 'gpio', function: 'PWM1', color: '#556B2F', description: 'GPIO 13 (PWM1)' }, // Verde oliva
  { number: 35, name: 'GPIO 19', type: 'gpio', function: 'sistema de archivos PCM', color: '#556B2F', description: 'GPIO 19 (PCM FS)' }, // Verde oliva
  { number: 37, name: 'GPIO 26', type: 'gpio', function: 'GPIO', color: '#556B2F', description: 'GPIO 26' }, // Verde oliva
  { number: 39, name: 'Suelo', type: 'ground', color: '#556B2F', description: 'Tierra' }, // Verde oliva
  
  // Columna derecha (pares)
  { number: 2, name: 'Alimentación de 5 V', type: 'power', color: '#DC143C', description: 'Alimentación 5V' }, // Rojo
  { number: 4, name: 'Alimentación de 5 V', type: 'power', color: '#DC143C', description: 'Alimentación 5V' }, // Rojo
  { number: 6, name: 'Suelo', type: 'ground', color: '#556B2F', description: 'Tierra' }, // Verde oliva
  { number: 8, name: 'GPIO 14', type: 'gpio', function: 'transmisión UART', color: '#DDA0DD', description: 'GPIO 14 (UART TX)' }, // Púrpura
  { number: 10, name: 'GPIO 15', type: 'gpio', function: 'UART RX', color: '#20B2AA', description: 'GPIO 15 (UART RX)' }, // Verde azulado
  { number: 12, name: 'GPIO 18', type: 'gpio', function: 'PCM CLK', color: '#20B2AA', description: 'GPIO 18 (PCM CLK)' }, // Verde azulado
  { number: 14, name: 'Suelo', type: 'ground', color: '#556B2F', description: 'Tierra' }, // Verde oliva
  { number: 16, name: 'GPIO 23', type: 'gpio', function: 'GPIO', color: '#556B2F', description: 'GPIO 23' }, // Verde oliva
  { number: 18, name: 'GPIO 24', type: 'gpio', function: 'GPIO', color: '#556B2F', description: 'GPIO 24' }, // Verde oliva
  { number: 20, name: 'Suelo', type: 'ground', color: '#556B2F', description: 'Tierra' }, // Verde oliva
  { number: 22, name: 'GPIO 25', type: 'gpio', function: 'GPIO', color: '#556B2F', description: 'GPIO 25' }, // Verde oliva
  { number: 24, name: 'GPIO 8', type: 'gpio', function: 'SPI0 CE0', color: '#FF69B4', description: 'GPIO 8 (SPI0 CE0)' }, // Rosa
  { number: 26, name: 'GPIO 7', type: 'gpio', function: 'SPI0 CE1', color: '#FF69B4', description: 'GPIO 7 (SPI0 CE1)' }, // Rosa
  { number: 28, name: 'GPIO 1', type: 'gpio', function: 'EEPROM SCL', color: '#87CEEB', description: 'GPIO 1 (EEPROM SCL)' }, // Azul claro
  { number: 30, name: 'Suelo', type: 'ground', color: '#556B2F', description: 'Tierra' }, // Verde oliva
  { number: 32, name: 'GPIO 12', type: 'gpio', function: 'PWM0', color: '#556B2F', description: 'GPIO 12 (PWM0)' }, // Verde oliva
  { number: 34, name: 'Suelo', type: 'ground', color: '#556B2F', description: 'Tierra' }, // Verde oliva
  { number: 36, name: 'GPIO 16', type: 'gpio', function: 'GPIO', color: '#32CD32', description: 'GPIO 16' }, // Verde
  { number: 38, name: 'GPIO 20', type: 'gpio', function: 'PCM DIN', color: '#87CEEB', description: 'GPIO 20 (PCM DIN)' }, // Azul claro
  { number: 40, name: 'GPIO 21', type: 'gpio', function: 'salida PCM', color: '#87CEEB', description: 'GPIO 21 (PCM DOUT)' }, // Azul claro
]

const PinsSidebar: React.FC<PinsSidebarProps> = ({ onPinSelect, selectedPin }) => {
  // Separar pines en dos columnas: impares (izquierda) y pares (derecha)
  const leftColumnPins = pinsData.filter(pin => pin.number % 2 === 1).sort((a, b) => a.number - b.number)
  const rightColumnPins = pinsData.filter(pin => pin.number % 2 === 0).sort((a, b) => a.number - b.number)

  return (
    <div className="pins-sidebar">
      <div className="pins-header">
        <h3>Distribución de pines de Raspberry Pi</h3>
      </div>
      
      <div className="pins-container">
        {/* Columna izquierda - Pines impares */}
        <div className="pins-column left-column">
          {leftColumnPins.map((pin) => (
            <div
              key={pin.number}
              className={`pin-item ${selectedPin?.number === pin.number ? 'selected' : ''}`}
              onClick={() => onPinSelect(pin)}
              title={pin.description}
            >
              <div className="pin-number">{pin.number}</div>
              <div 
                className="pin-indicator"
                style={{ backgroundColor: pin.color }}
              />
              <div className="pin-info">
                <div className="pin-name">{pin.name}</div>
                {pin.function && (
                  <div className="pin-function">({pin.function})</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Separador central */}
        <div className="pins-separator"></div>

        {/* Columna derecha - Pines pares */}
        <div className="pins-column right-column">
          {rightColumnPins.map((pin) => (
            <div
              key={pin.number}
              className={`pin-item ${selectedPin?.number === pin.number ? 'selected' : ''}`}
              onClick={() => onPinSelect(pin)}
              title={pin.description}
            >
              <div className="pin-number">{pin.number}</div>
              <div 
                className="pin-indicator"
                style={{ backgroundColor: pin.color }}
              />
              <div className="pin-info">
                <div className="pin-name">{pin.name}</div>
                {pin.function && (
                  <div className="pin-function">({pin.function})</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PinsSidebar
