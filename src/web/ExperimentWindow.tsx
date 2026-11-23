import type { ComponentProps } from 'react'
import { useClassroom } from './Classroom'
import { DeviceWindow } from './DeviceWindow'
import './experiment-window.css'

export function ExperimentWindow({ children, ...props }: ComponentProps<typeof DeviceWindow>) {
  const classroom = useClassroom()
  return classroom ? <DeviceWindow {...props}>{children}</DeviceWindow> : <>{children}</>
}
