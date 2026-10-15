// config/cvaModulesConfig.ts — Configuración declarativa de módulos CVA y cámaras de laboratorio asociadas
export interface CvaLabCameraConfig {
    enabled: boolean;
    groupKey: string;
    cameraId: string;
    label?: string;
}

export interface CvaModuleConfig {
    id: 'robot' | 'domotica' | string;
    name: string;
    labCamera?: CvaLabCameraConfig;
}

export const CVA_MODULES_CONFIG: Record<string, CvaModuleConfig> = {
    robot: {
        id: 'robot',
        name: 'Robot EV3',
        labCamera: {
            enabled: true,
            groupKey: 'pilabpiloto',
            cameraId: '01',
            label: 'Cámara del Laboratorio (Robot EV3)',
        },
    },
    domotica: {
        id: 'domotica',
        name: 'Domótica (Arduino)',
        labCamera: {
            enabled: false,
            groupKey: 'pilabpiloto',
            cameraId: '',
            label: 'Cámara del Laboratorio (Domótica)',
        },
    },
};

export function getCvaModuleConfig(moduleId: string): CvaModuleConfig | undefined {
    return CVA_MODULES_CONFIG[moduleId];
}
