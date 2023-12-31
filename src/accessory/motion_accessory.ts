import { base_accessory } from './base_accessory';
import { HomebridgePlatform } from '../HomebridgePlatform';
import { PlatformAccessory, Categories, Service } from 'homebridge';
import { IDevice, IDeviceState } from '../ts/interface/IDevice';
import { ECapability } from '../ts/enum/ECapability';
import deviceUtils from '../utils/deviceUtils';

export class motion_accessory extends base_accessory {

	service: Service | undefined;
	batteryService: Service | undefined;

	constructor(platform: HomebridgePlatform, accessory: PlatformAccessory | undefined, device: IDevice) {
		super(platform, accessory, Categories.SENSOR, device);
	}
	mountService(): void {
		this.service = this.accessory?.getService(this.platform.Service.MotionSensor) || this.accessory?.addService(this.platform.Service.MotionSensor);
		this.service?.getCharacteristic(this.platform.Characteristic.MotionDetected)
			.onGet(() => {
				return this.getDeviceStateByCap(ECapability.DETECT, this.device)
			})

		if (deviceUtils.renderServiceByCapability(this.device, ECapability.BATTERY)) {
			this.batteryService = this.accessory?.getService(this.platform.Service.Battery) || this.accessory?.addService(this.platform.Service.Battery);
			this.batteryService?.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
				.onGet(() => (+this.getDeviceStateByCap(ECapability.BATTERY, this.device) < 20 ? 1 : 0));

			this.batteryService
				?.getCharacteristic(this.platform.Characteristic.BatteryLevel)
				.onGet(() => {
					return this.getDeviceStateByCap(ECapability.BATTERY, this.device)
				})
		}
	}
	updateValue(): void {
		const stateArr = Object.keys(this.device.state);
		if (!stateArr.length) return;
		stateArr.forEach(stateKey => {
			if (stateKey === 'detect') {
				this.service?.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.getDeviceStateByCap(ECapability.DETECT, this.device))
			} else if (stateKey === 'battery') {
				this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.getDeviceStateByCap(ECapability.BATTERY, this.device))
				this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, +this.getDeviceStateByCap(ECapability.BATTERY, this.device) < 20 ? 1 : 0)
			}
		})
	}
}
