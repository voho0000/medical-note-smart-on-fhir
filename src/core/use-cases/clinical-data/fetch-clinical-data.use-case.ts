// Use Case: Fetch Clinical Data
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import type { IClinicalDataRepository } from '@/src/core/interfaces/repositories/clinical-data.repository.interface'

export class FetchClinicalDataUseCase {
  constructor(private clinicalDataRepository: IClinicalDataRepository) {}

  async execute(patientId: string): Promise<ClinicalDataCollection> {
    return await this.clinicalDataRepository.fetchAllClinicalData(patientId)
  }
}
