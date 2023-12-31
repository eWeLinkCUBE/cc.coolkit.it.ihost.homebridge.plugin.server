import { Categories, LogLevel, PlatformAccessory } from 'homebridge';
import { HomebridgePlatform } from '../HomebridgePlatform';
import { IDevice } from '../ts/interface/IDevice';
import { IBaseAccessory, IBaseAccessoryExtra } from '../ts/interface/IBaseAccessory';
import ihostConfig from '../config/IhostConfig';
import httpRequest from '../service/httpRequest';
import { IHttpConfig } from '../ts/interface/IHttpConfig';
import { EMethod } from '../ts/enum/EMethod';
import { EHttpPath } from '../ts/enum/EHttpPath';
import deviceUtils from '../utils/deviceUtils';
import { ECapability } from '../ts/enum/ECapability';
import { get, isString } from 'lodash';
import IRFBridgeInfo from '../ts/interface/IRFBridgeInfo';

export class base_accessory implements IBaseAccessory {
    platform: HomebridgePlatform;
    accessory: PlatformAccessory | undefined;
    category: Categories;
    device: IDevice;
    extra?: IBaseAccessoryExtra;

    constructor(platform: HomebridgePlatform, accessory: PlatformAccessory | undefined, category: Categories, device: IDevice, extra?: IBaseAccessoryExtra) {
        this.platform = platform;
        this.accessory = accessory;
        this.category = category;
        this.device = device;
        this.extra = extra;

        const rfCurtainChl = get(this, ['extra', 'rfCurtainChl'], null);
        if (!this.device.state) {
            Object.assign(this.device, { state: {} })
        }
        if (!this.accessory) {
            const sn = (deviceUtils.isRfBridge(device) && isString(rfCurtainChl)) ? `${device.serial_number}_curtain_${rfCurtainChl}` : device.serial_number;
            const uuid = platform.api.hap.uuid.generate(sn);
            this.accessory = new platform.api.platformAccessory(device.name, uuid, category);
        } else {
            // this.platform.logManager(LogLevel.INFO, 'Existing Accessory', this.accessory.UUID, this.accessory.displayName)
        }
        //	set fundamental device info
        this.accessory.getService(this.platform.Service.AccessoryInformation)
            ?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'eWeLink CUBE')
            .setCharacteristic(this.platform.Characteristic.Name, device.name)
            .setCharacteristic(this.platform.Characteristic.SerialNumber, device.serial_number)
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, device.firmware_version);
        // .setCharacteristic(this.platform.Characteristic.Model, device.model)

        if (deviceUtils.isRfBridge(device)) {
            let name = "";
            const rfGatewayConfig = get(this.device, ['tags', '_smartHomeConfig', 'rfGatewayConfig'], null) as IRFBridgeInfo | null;
            if (!rfGatewayConfig) return;
            if (rfGatewayConfig.type !== "5") return;
            rfGatewayConfig.buttonInfoList.forEach(buttonInfo => {
                if (buttonInfo.rfChl === rfCurtainChl) {
                    name = buttonInfo.name
                }
            })
            const actualName = name || device.name;
            this.accessory.getService(this.platform.Service.AccessoryInformation)?.setCharacteristic(this.platform.Characteristic.Name, actualName)
        }
    }

    mountService() { }
    updateValue(params?: any) { }
    getDeviceStateByCap(capability: ECapability, device: IDevice, index?: number) {
        const { online = false } = device;
        if (!online) {
            this.platform.logManager(LogLevel.INFO, "device off line", device.serial_number, device.name, online)
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)
        }
        return deviceUtils.getDeviceStateByCap(capability, device, index)
    }

    //	update device state request
    async sendToDevice(params: any) {
        try {
            const httpConfig: IHttpConfig = {
                ip: ihostConfig.ip,
                at: ihostConfig.at,
                method: EMethod.PUT,
                path: `${EHttpPath.DEVICES}/${this.device.serial_number}`,
                params
            };
            const resp = await httpRequest(httpConfig);
            this.platform.logManager(LogLevel.INFO, 'control device params', JSON.stringify(params))
            this.platform.logManager(LogLevel.INFO, 'openapi response', resp)
            if (resp && resp.error === 0) {
                this.platform.updateAccessory(this.device.serial_number, params.state);
                return;
            }
            this.platform.updateAccessory(this.device.serial_number);
        } catch (error) {
            this.platform.logManager(LogLevel.ERROR, 'openapi control fail', error);
            // change ip for domain and retry
            const res = await this.retryForDomain();
            if (res!.error === 0) {
                await this.sendToDevice(params);
                this.platform.initSSE()
            }
        }
    }

    async retryForDomain() {
        const { name } = ihostConfig;
        const isIHost = name.includes('ihost');
        const domain = isIHost ? 'ihost' : 'nspanelpro.local:8081';
        const httpConfig: IHttpConfig = {
            path: EHttpPath.IHOST_INFO,
            ip: domain,
            method: EMethod.GET,
        }

        try {
            const resp = await httpRequest(httpConfig);
            if (resp.error !== 0) {
                return resp;
            }
            if (resp.data.mac === ihostConfig.mac) {
                ihostConfig.ip = isIHost ? resp.data.ip : `${resp.data.ip}:8081`;
                return {
                    error: 0
                }
            }
        } catch (error) {
            this.platform.logManager(LogLevel.INFO, "api error")
            return {
                error: 1000,
                data: []
            }
        }
    }
}
