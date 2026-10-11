import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';

export interface Vehicle {
  id: string;
  name: string;
  category: 'Tractor' | 'Harvester' | 'Tiller' | 'Drone' | 'Laser Leveler';
  hp: string;
  hourlyRate: number;
  acreRate?: number;
  dailyRate?: number;
  fuelIncluded: boolean;
  operatorIncluded: boolean;
  operatorName: string;
  operatorPhone: string;
  operatorRating: number;
  completedJobs: number;
  distanceKm: number;
  location: string;
  attachments: string[];
  isAvailable: boolean;
  badge?: string;
  imageUrl?: string;
}

export interface VehicleBooking {
  id: string;
  farmerId: string;
  farmerName: string;
  vehicleId: string;
  vehicleName: string;
  category: string;
  farmPlot: string;
  taskType: string;
  bookingDate: string;
  timeSlot: string;
  duration: number;
  unit: 'hours' | 'acres';
  totalAmount: number;
  status: 'CONFIRMED' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  withOperator: boolean;
  operatorName: string;
  operatorPhone: string;
  notes?: string;
  createdAt: Date;
}

@Injectable()
export class VehiclesService {
  private readonly vehicles: Vehicle[] = [
    {
      id: 'veh_1',
      name: 'Mahindra 575 DI (45 HP Tractor)',
      category: 'Tractor',
      hp: '45 HP',
      hourlyRate: 700,
      dailyRate: 3500,
      fuelIncluded: true,
      operatorIncluded: true,
      operatorName: 'Thangavel M.',
      operatorPhone: '+91 98421 55219',
      operatorRating: 4.9,
      completedJobs: 142,
      distanceKm: 2.8,
      location: 'Pollachi Rural Hub',
      attachments: ['Rotavator', 'MB Plough', 'Disc Harrow', 'Tipping Trolley'],
      isAvailable: true,
      badge: 'Most Popular',
    },
    {
      id: 'veh_2',
      name: 'John Deere 5310 4WD Heavy Tractor',
      category: 'Tractor',
      hp: '55 HP 4WD',
      hourlyRate: 950,
      dailyRate: 4800,
      fuelIncluded: true,
      operatorIncluded: true,
      operatorName: 'Velusamy K.',
      operatorPhone: '+91 97892 41109',
      operatorRating: 4.8,
      completedJobs: 98,
      distanceKm: 4.2,
      location: 'Kinathukadavu Gate',
      attachments: ['Heavy Duty Cultivator', 'Laser Leveler', 'Post Hole Digger'],
      isAvailable: true,
      badge: 'High Power 4WD',
    },
    {
      id: 'veh_3',
      name: 'Claas Crop Tiger 30 Combine Harvester',
      category: 'Harvester',
      hp: '76 HP Heavy Grain Header',
      hourlyRate: 1800,
      acreRate: 2200,
      fuelIncluded: true,
      operatorIncluded: true,
      operatorName: 'Ramalingam P.',
      operatorPhone: '+91 94432 89012',
      operatorRating: 5.0,
      completedJobs: 215,
      distanceKm: 5.5,
      location: 'Sulur APMC Machinery Yard',
      attachments: ['Wheat Cutting Header', 'Paddy Track Kit', 'Automatic Grain Bagger'],
      isAvailable: true,
      badge: 'Wheat & Paddy Specialist',
    },
    {
      id: 'veh_4',
      name: 'Preet 987 Giant Combine Harvester',
      category: 'Harvester',
      hp: '101 HP 14-Foot Cutter',
      hourlyRate: 2200,
      acreRate: 2400,
      fuelIncluded: true,
      operatorIncluded: true,
      operatorName: 'Gurpreet Singh',
      operatorPhone: '+91 98140 33452',
      operatorRating: 4.9,
      completedJobs: 180,
      distanceKm: 7.8,
      location: 'Annur Agro Station',
      attachments: ['Heavy Multi-Crop Header', 'Straw Chopper'],
      isAvailable: true,
      badge: 'Fast Acre Coverage',
    },
    {
      id: 'veh_5',
      name: 'Garuda Kisan Drone Sprayer (16 Litre)',
      category: 'Drone',
      hp: 'DGCA Certified Autonomous ULV',
      hourlyRate: 1200,
      acreRate: 450,
      fuelIncluded: true,
      operatorIncluded: true,
      operatorName: 'Vignesh R. (Certified Pilot)',
      operatorPhone: '+91 99440 18274',
      operatorRating: 4.9,
      completedJobs: 340,
      distanceKm: 3.0,
      location: 'Perur Agro Innovation Hub',
      attachments: ['Micron Mist Nozzles', 'Terrain Follow Radar', 'Nano-Urea Tank'],
      isAvailable: true,
      badge: 'Precision Nano Spray',
    },
    {
      id: 'veh_6',
      name: 'VST Shakti 130 DI Power Tiller',
      category: 'Tiller',
      hp: '13 HP Rotary Tiller',
      hourlyRate: 450,
      dailyRate: 2200,
      fuelIncluded: false,
      operatorIncluded: true,
      operatorName: 'Muthusamy C.',
      operatorPhone: '+91 96291 04821',
      operatorRating: 4.7,
      completedJobs: 87,
      distanceKm: 1.8,
      location: 'Thondamuthur Village',
      attachments: ['Wetland Cage Wheels', 'Dry Land Rotavator Blade'],
      isAvailable: true,
      badge: 'Ideal For Small Plots',
    },
    {
      id: 'veh_7',
      name: 'Kubota MU4501 4WD Tractor',
      category: 'Tractor',
      hp: '45 HP Low Vibration',
      hourlyRate: 800,
      dailyRate: 3900,
      fuelIncluded: true,
      operatorIncluded: true,
      operatorName: 'Saravanan S.',
      operatorPhone: '+91 98944 67123',
      operatorRating: 4.8,
      completedJobs: 110,
      distanceKm: 3.6,
      location: 'Madukkarai Branch',
      attachments: ['Precision Seed Drill', 'Disc Plough'],
      isAvailable: true,
      badge: 'Fuel Efficient',
    },
    {
      id: 'veh_8',
      name: 'Fieldking Heavy Laser Land Leveler',
      category: 'Laser Leveler',
      hp: 'Dual Transmitter Guided',
      hourlyRate: 1100,
      acreRate: 1400,
      fuelIncluded: true,
      operatorIncluded: true,
      operatorName: 'Karthik Raja',
      operatorPhone: '+91 97500 81290',
      operatorRating: 4.8,
      completedJobs: 76,
      distanceKm: 6.0,
      location: 'Palladam Road Junction',
      attachments: ['2.5m Heavy Bucket', 'Laser Mast & Receiver'],
      isAvailable: true,
      badge: 'Saves 30% Irrigation Water',
    },
  ];

  private readonly bookings: VehicleBooking[] = [
    {
      id: 'BK-9042',
      farmerId: 'farmer_default',
      farmerName: 'Madhan Kumar',
      vehicleId: 'veh_3',
      vehicleName: 'Claas Crop Tiger 30 Combine Harvester',
      category: 'Harvester',
      farmPlot: 'North Field - Plot 2 (Paddy / Wheat)',
      taskType: 'Wheat Harvesting & Grain Bagging',
      bookingDate: '26 Sept 2026',
      timeSlot: 'Morning (07:00 AM - 11:00 AM)',
      duration: 3,
      unit: 'acres',
      totalAmount: 6600,
      status: 'CONFIRMED',
      withOperator: true,
      operatorName: 'Ramalingam P.',
      operatorPhone: '+91 94432 89012',
      notes: 'Please arrive via east canal access road. Field ground is dry.',
      createdAt: new Date(),
    },
    {
      id: 'BK-8910',
      farmerId: 'farmer_default',
      farmerName: 'Madhan Kumar',
      vehicleId: 'veh_1',
      vehicleName: 'Mahindra 575 DI (45 HP Tractor)',
      category: 'Tractor',
      farmPlot: 'South Field - Plot 1 (Tomato Beds)',
      taskType: 'Deep Rotavation & Bed Staking',
      bookingDate: '15 Sept 2026',
      timeSlot: 'Morning (08:00 AM - 12:00 PM)',
      duration: 4,
      unit: 'hours',
      totalAmount: 2800,
      status: 'COMPLETED',
      withOperator: true,
      operatorName: 'Thangavel M.',
      operatorPhone: '+91 98421 55219',
      notes: 'Completed 4 hours smoothly. Soil pulverized to fine tilth.',
      createdAt: new Date(Date.now() - 10 * 86400000),
    },
  ];

  getAllVehicles(category?: string): Vehicle[] {
    if (!category || category === 'All') return this.vehicles;
    return this.vehicles.filter((v) => v.category.toLowerCase() === category.toLowerCase());
  }

  getVehicleById(id: string): Vehicle {
    const v = this.vehicles.find((x) => x.id === id);
    if (!v) throw new NotFoundException('Machinery / Vehicle not found');
    return v;
  }

  bookVehicle(dto: {
    farmerId?: string;
    farmerName?: string;
    vehicleId: string;
    farmPlot: string;
    taskType: string;
    bookingDate: string;
    timeSlot: string;
    duration: number;
    unit?: 'hours' | 'acres';
    withOperator?: boolean;
    notes?: string;
  }): VehicleBooking {
    const vehicle = this.getVehicleById(dto.vehicleId);
    const unit = dto.unit || 'hours';
    const duration = parseFloat(String(dto.duration || 1));

    if (duration <= 0) {
      throw new BadRequestException('Duration must be greater than zero');
    }

    const rate = unit === 'acres' && vehicle.acreRate ? vehicle.acreRate : vehicle.hourlyRate;
    const baseCost = rate * duration;
    const operatorFee = dto.withOperator !== false ? 0 : 0; // included by default
    const totalAmount = baseCost + operatorFee;

    const newBooking: VehicleBooking = {
      id: `BK-${Math.floor(1000 + Math.random() * 9000)}`,
      farmerId: dto.farmerId || 'farmer_default',
      farmerName: dto.farmerName || 'Madhan Kumar',
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      category: vehicle.category,
      farmPlot: dto.farmPlot || 'Main Farm Plot',
      taskType: dto.taskType || 'General Farm Operation',
      bookingDate: dto.bookingDate || 'Today',
      timeSlot: dto.timeSlot || 'Morning (07:00 AM - 11:00 AM)',
      duration,
      unit,
      totalAmount,
      status: 'CONFIRMED',
      withOperator: dto.withOperator !== false,
      operatorName: vehicle.operatorName,
      operatorPhone: vehicle.operatorPhone,
      notes: dto.notes || '',
      createdAt: new Date(),
    };

    this.bookings.unshift(newBooking);
    return newBooking;
  }

  getMyBookings(farmerId?: string): VehicleBooking[] {
    return this.bookings;
  }

  cancelBooking(id: string): { success: boolean; message: string; booking: VehicleBooking } {
    const booking = this.bookings.find((b) => b.id === id);
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === 'COMPLETED') {
      throw new BadRequestException('Completed bookings cannot be cancelled');
    }
    booking.status = 'CANCELLED';
    return {
      success: true,
      message: `Booking #${id} has been cancelled successfully.`,
      booking,
    };
  }
}
