// Use Case: Get Patient
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import type { IPatientRepository } from '@/src/core/interfaces/repositories/patient.repository.interface'

export class GetPatientUseCase {
  constructor(private patientRepository: IPatientRepository) {}

  async execute(): Promise<PatientEntity | null> {
    return await this.patientRepository.getCurrentPatient()
  }
}
